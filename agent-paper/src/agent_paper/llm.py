import asyncio
import json
import re
from collections.abc import Awaitable, Callable
from typing import Any, TypeVar

from langchain.chat_models import init_chat_model
from langchain_core.language_models import BaseChatModel
from langchain_core.runnables import RunnableConfig
from pydantic import BaseModel, ValidationError

DEFAULT_PROVIDER = "mistralai"
DEFAULT_MODEL = "mistral-small-latest"

# OpenRouter is OpenAI-API-compatible: the OpenAI client pointed at a different base URL.
# One key reaches every vendor, so model ids are vendor-namespaced ("anthropic/claude-...").
OPENROUTER = "openrouter"
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
OPENROUTER_DEFAULT_MODEL = "openai/gpt-4o-mini"

# OpenRouter reserves credit up front against max_tokens, defaulting to the model's whole
# completion window (often 64k) when it is unset — so every call reserves as if it will write
# a novel and fails on a small balance. A section targets ~450 words, so this is ample.
OPENROUTER_MAX_TOKENS = 4096

Schema = TypeVar("Schema", bound=BaseModel)


def build_model(provider: str, api_key: str, model: str | None = None) -> BaseChatModel:
    """Build the chat model for a run.

    `/paper` is BYOM-only: a run costs 15-30 LLM calls against 1-2 for a chat turn, which
    would drain the funded tier's daily cap in a couple of runs. The key always comes from
    the caller — there is no funded fallback here.

    Providers other than Mistral and OpenRouter need their own langchain integration package
    installed.
    """
    if provider == OPENROUTER:
        # init_chat_model's openai path forwards base_url to ChatOpenAI.
        return init_chat_model(
            model or OPENROUTER_DEFAULT_MODEL,
            model_provider="openai",
            api_key=api_key,
            base_url=OPENROUTER_BASE_URL,
            max_tokens=OPENROUTER_MAX_TOKENS,
            temperature=0,
        )
    return init_chat_model(
        model or DEFAULT_MODEL, model_provider=provider, api_key=api_key, temperature=0
    )


def model_from(config: RunnableConfig) -> BaseChatModel:
    return config["configurable"]["model"]


# Seconds to wait before each attempt. A paper is dozens of calls in quick succession, so
# free-tier keys hit provider rate limits partway through a run; the provider SDK's own
# max_retries does not cover 429.
RETRY_DELAYS = (0, 2, 8, 20)


def _is_rate_limited(err: BaseException) -> bool:
    # Matched on text rather than an exception type: each provider raises its own class, and
    # this has to hold for whichever one the user brought.
    text = str(err).lower()
    return "429" in text or "rate limit" in text


def _is_transient(err: BaseException) -> bool:
    # Retry the failures that a fresh attempt usually clears: rate limits, and a model
    # emitting JSON that doesn't parse or validate against the schema.
    return _is_rate_limited(err) or isinstance(err, (ValueError, ValidationError))


async def _with_retries(
    call: Callable[[], Awaitable[Any]],
    what: str,
    retry_on: Callable[[BaseException], bool],
) -> Any:
    """Run a model call, retrying while `retry_on` holds. A paper fires dozens of calls in
    quick succession, so the transient failures that a single-call pipeline shrugged off
    show up on nearly every run."""
    for attempt, delay in enumerate(RETRY_DELAYS):
        if delay:
            await asyncio.sleep(delay)
        last = attempt == len(RETRY_DELAYS) - 1
        try:
            result = await call()
        except Exception as err:
            if last or not retry_on(err):
                raise
            continue
        if result is not None:
            return result

    raise ValueError(f"Model returned no usable {what} after {len(RETRY_DELAYS)} attempts")


def _extract_json(text: str) -> str:
    """Pull the JSON object out of a model reply.

    Models wrap it in ``` fences or precede it with prose even when told not to (the failure
    that broke Groq: it emitted valid JSON as a code block instead of a tool call). Taking the
    outermost braces tolerates both.
    """
    fenced = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if fenced:
        text = fenced.group(1)
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("no JSON object in model output")
    return text[start : end + 1]


async def ask(config: RunnableConfig, schema: type[Schema], prompt: str) -> Schema:
    """A call whose result has real structure — queries, a ranking, a set of themes.

    Deliberately not `with_structured_output`: its default forces a tool call, which some
    models (Groq's gpt-oss, Mistral on long output) do not honor — they write the JSON as
    text and the provider rejects the turn. Asking for JSON in the prompt and parsing it
    works on every provider, since producing JSON is something they all do reliably.
    """
    model = model_from(config)
    instructed = (
        f"{prompt}\n\nReturn ONLY a JSON object matching this schema, with no other text:\n"
        f"{json.dumps(schema.model_json_schema())}"
    )

    async def call() -> Schema:
        message = await model.ainvoke(instructed)
        return schema.model_validate_json(_extract_json(_content_str(message)))

    return await _with_retries(call, schema.__name__, _is_transient)


async def ask_text(config: RunnableConfig, prompt: str) -> str:
    """A call whose result is prose — a summary or a section of the draft."""
    model = model_from(config)
    message = await _with_retries(lambda: model.ainvoke(prompt), "text", _is_rate_limited)
    return _content_str(message)


def _content_str(message: Any) -> str:
    content = message.content
    return content if isinstance(content, str) else str(content)


def render_cards(cards: list[dict[str, Any]]) -> str:
    """Compact artifact listing for prompts — the model only needs identity and context,
    and full JSON cards would waste a large share of the context window."""
    lines = []
    for card in cards:
        facets = [card.get(f) for f in ("period", "provenience", "genre", "language")]
        described = ", ".join(str(value) for value in facets if value)
        lines.append(
            f"{card['p_number']}: {card.get('designation') or '(no designation)'} — {described}"
        )
    return "\n".join(lines)

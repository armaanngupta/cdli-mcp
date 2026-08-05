from typing import Any, TypeVar

from langchain.chat_models import init_chat_model
from langchain_core.language_models import BaseChatModel
from langchain_core.runnables import RunnableConfig
from pydantic import BaseModel

DEFAULT_PROVIDER = "mistralai"
DEFAULT_MODEL = "mistral-small-latest"

Schema = TypeVar("Schema", bound=BaseModel)


def build_model(provider: str, api_key: str, model: str | None = None) -> BaseChatModel:
    """Build the chat model for a run.

    `/paper` is BYOM-only: a run costs 15-30 LLM calls against 1-2 for a chat turn, which
    would drain the funded tier's daily cap in a couple of runs. The key always comes from
    the caller — there is no funded fallback here.

    Providers other than Mistral need their own langchain integration package installed.
    """
    return init_chat_model(
        model or DEFAULT_MODEL, model_provider=provider, api_key=api_key, temperature=0
    )


def model_from(config: RunnableConfig) -> BaseChatModel:
    return config["configurable"]["model"]


async def ask(config: RunnableConfig, schema: type[Schema], prompt: str) -> Schema:
    """One structured call. Every node's model use goes through here so the shape of a
    request is uniform and there is a single place to add retries or cost accounting."""
    model = model_from(config).with_structured_output(schema)
    return await model.ainvoke(prompt)


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

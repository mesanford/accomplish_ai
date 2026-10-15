"""The real plan model: Claude through the Anthropic API, answering in JSON that follows RESPONSE_SCHEMA.

The client is passed in, so tests use a fake and never touch the network.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Mapping
from typing import Any

from .assistant import ModelFn
from .assistant_prompt import RESPONSE_SCHEMA, SYSTEM_PROMPT

log = logging.getLogger(__name__)

DEFAULT_MODEL = "claude-sonnet-5-5"
PLAN_FORMAT = {"format": {"type": "json_schema", "schema": RESPONSE_SCHEMA}}


def _log_usage(model: str, response: Any) -> None:
    usage = getattr(response, "usage", None)
    log.info(
        "claude usage model=%s input_tokens=%s output_tokens=%s",
        model,
        getattr(usage, "input_tokens", None),
        getattr(usage, "output_tokens", None),
    )


def client_settings(env: Mapping[str, str]) -> dict:
    """Anthropic client arguments from the function's environment.

    ANTHROPIC_API_KEY comes from the Cloud Functions secret. ANTHROPIC_WORKSPACE_ID is needed when the key is not
    scoped to a workspace; it is sent with every request.
    """
    settings: dict = {"api_key": env["ANTHROPIC_API_KEY"]}
    workspace = env.get("ANTHROPIC_WORKSPACE_ID")
    if workspace:
        settings["default_headers"] = {"anthropic-workspace-id": workspace}
    return settings


def real_client(env: Mapping[str, str]) -> Any:
    """REAL path: an Anthropic client for this project."""
    import anthropic

    return anthropic.Anthropic(**client_settings(env))


def claude_model(client: Any, model: str = DEFAULT_MODEL) -> ModelFn:
    """A ModelFn that sends the prompt to Claude and returns its plan, parsed from structured JSON output."""

    def call(prompt: str) -> dict:
        response = client.messages.create(
            model=model,
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            output_config=PLAN_FORMAT,
            messages=[{"role": "user", "content": prompt}],
        )
        _log_usage(model, response)
        text = "".join(getattr(b, "text", "") for b in response.content if getattr(b, "type", None) == "text")
        return json.loads(text) if text.strip() else {}

    return call


def claude_text(client: Any, prompt: str, system: str, model: str = DEFAULT_MODEL, max_tokens: int = 1024) -> str:
    """Plain text from Claude, for writing help such as a troop website's About us section."""
    response = client.messages.create(
        model=model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": prompt}],
    )
    _log_usage(model, response)
    return "".join(getattr(b, "text", "") for b in response.content if getattr(b, "type", None) == "text")

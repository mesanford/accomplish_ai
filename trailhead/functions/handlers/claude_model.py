"""The real plan model: Claude through the Anthropic API, answering with one forced tool call.

The client is passed in, so tests use a fake and never touch the network.
"""

from __future__ import annotations

import logging
from typing import Any

from .assistant import ModelFn
from .assistant_prompt import RESPONSE_SCHEMA, SYSTEM_PROMPT

log = logging.getLogger(__name__)

DEFAULT_MODEL = "claude-sonnet-5-5"
TOOL_NAME = "submit_plan"
PLAN_TOOL = {
    "name": TOOL_NAME,
    "description": "Submit the drafted merit badge plan and a short explanation.",
    "input_schema": RESPONSE_SCHEMA,
}


def claude_model(client: Any, model: str = DEFAULT_MODEL) -> ModelFn:
    """A ModelFn that sends the prompt to Claude and returns the plan it submits through the tool."""

    def call(prompt: str) -> dict:
        response = client.messages.create(
            model=model,
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            tools=[PLAN_TOOL],
            tool_choice={"type": "tool", "name": TOOL_NAME},
            messages=[{"role": "user", "content": prompt}],
        )
        usage = getattr(response, "usage", None)
        log.info(
            "claude usage model=%s input_tokens=%s output_tokens=%s",
            model,
            getattr(usage, "input_tokens", None),
            getattr(usage, "output_tokens", None),
        )
        for block in response.content:
            if getattr(block, "type", None) == "tool_use" and getattr(block, "name", None) == TOOL_NAME:
                return dict(block.input)
        return {}

    return call


def claude_text(client: Any, prompt: str, system: str, model: str = DEFAULT_MODEL, max_tokens: int = 1024) -> str:
    """Plain text from Claude, for writing help such as a troop website's About us section."""
    response = client.messages.create(
        model=model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": prompt}],
    )
    usage = getattr(response, "usage", None)
    log.info(
        "claude usage model=%s input_tokens=%s output_tokens=%s",
        model,
        getattr(usage, "input_tokens", None),
        getattr(usage, "output_tokens", None),
    )
    return "".join(getattr(b, "text", "") for b in response.content if getattr(b, "type", None) == "text")

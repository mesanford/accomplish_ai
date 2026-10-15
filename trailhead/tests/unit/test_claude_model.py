import json
from types import SimpleNamespace

from handlers.assistant_prompt import RESPONSE_SCHEMA, SYSTEM_PROMPT
from handlers.claude_model import DEFAULT_MODEL, claude_model

PLAN = {
    "items": [{"awardId": "swimming", "plannedStart": "2026-11-01", "plannedEnd": "2026-12-15"}],
    "explanation": "Swim first.",
}


class FakeMessages:
    def __init__(self, content):
        self.content = content
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(content=self.content, usage=SimpleNamespace(input_tokens=900, output_tokens=120))


def fake_client(content):
    return SimpleNamespace(messages=FakeMessages(content))


def text_block(text):
    return SimpleNamespace(type="text", text=text)


def test_asks_for_structured_json_and_parses_it():
    client = fake_client([text_block(json.dumps(PLAN))])
    assert claude_model(client)("the prompt") == PLAN
    call = client.messages.calls[0]
    assert call["model"] == DEFAULT_MODEL == "claude-sonnet-5-5"
    assert call["system"] == SYSTEM_PROMPT
    assert call["output_config"] == {"format": {"type": "json_schema", "schema": RESPONSE_SCHEMA}}
    assert "tools" not in call and "tool_choice" not in call
    assert call["messages"] == [{"role": "user", "content": "the prompt"}]


def test_uses_the_model_it_is_given():
    client = fake_client([text_block(json.dumps(PLAN))])
    claude_model(client, "claude-haiku-4-5-20251001")("p")
    assert client.messages.calls[0]["model"] == "claude-haiku-4-5-20251001"


def test_no_text_answer_gives_an_empty_draft():
    client = fake_client([])
    assert claude_model(client)("p") == {}


def test_schema_is_plain_json_schema():
    assert RESPONSE_SCHEMA["type"] == "object"
    assert RESPONSE_SCHEMA["properties"]["items"]["items"]["required"] == ["awardId", "plannedStart", "plannedEnd"]
    # structured outputs need every object closed
    assert RESPONSE_SCHEMA["additionalProperties"] is False
    assert RESPONSE_SCHEMA["properties"]["items"]["items"]["additionalProperties"] is False


def test_text_helper_joins_text_blocks():
    from handlers.claude_model import claude_text

    client = fake_client(
        [SimpleNamespace(type="text", text="We camp monthly."), SimpleNamespace(type="text", text=" Join us.")]
    )
    assert claude_text(client, "notes", "system") == "We camp monthly. Join us."
    assert client.messages.calls[0]["system"] == "system"
    assert "output_config" not in client.messages.calls[0]


def test_client_settings_add_the_workspace_header_only_when_set():
    from handlers.claude_model import client_settings

    assert client_settings({"ANTHROPIC_API_KEY": "k"}) == {"api_key": "k"}
    assert client_settings({"ANTHROPIC_API_KEY": "k", "ANTHROPIC_WORKSPACE_ID": "wrkspc_1"}) == {
        "api_key": "k",
        "default_headers": {"anthropic-workspace-id": "wrkspc_1"},
    }

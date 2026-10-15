from types import SimpleNamespace

from handlers.assistant_prompt import RESPONSE_SCHEMA, SYSTEM_PROMPT
from handlers.claude_model import DEFAULT_MODEL, TOOL_NAME, claude_model

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


def test_forces_the_plan_tool_and_returns_its_input():
    client = fake_client([SimpleNamespace(type="tool_use", name=TOOL_NAME, input=PLAN)])
    assert claude_model(client)("the prompt") == PLAN
    call = client.messages.calls[0]
    assert call["model"] == DEFAULT_MODEL == "claude-sonnet-5-5"
    assert call["system"] == SYSTEM_PROMPT
    assert call["tool_choice"] == {"type": "tool", "name": TOOL_NAME}
    assert call["tools"][0]["input_schema"] is RESPONSE_SCHEMA
    assert call["messages"] == [{"role": "user", "content": "the prompt"}]


def test_uses_the_model_it_is_given():
    client = fake_client([SimpleNamespace(type="tool_use", name=TOOL_NAME, input=PLAN)])
    claude_model(client, "claude-haiku-4-5-20251001")("p")
    assert client.messages.calls[0]["model"] == "claude-haiku-4-5-20251001"


def test_no_tool_answer_gives_an_empty_draft():
    client = fake_client([SimpleNamespace(type="text", text="Sorry, I can't.")])
    assert claude_model(client)("p") == {}


def test_schema_is_plain_json_schema():
    assert RESPONSE_SCHEMA["type"] == "object"
    assert RESPONSE_SCHEMA["properties"]["items"]["items"]["required"] == ["awardId", "plannedStart", "plannedEnd"]


def test_text_helper_joins_text_blocks():
    from handlers.claude_model import claude_text

    client = fake_client(
        [SimpleNamespace(type="text", text="We camp monthly."), SimpleNamespace(type="text", text=" Join us.")]
    )
    assert claude_text(client, "notes", "system") == "We camp monthly. Join us."
    assert client.messages.calls[0]["system"] == "system"
    assert "tools" not in client.messages.calls[0]

import logging

from endpoints.mailer import RESEND_URL, app_url, email_mode, send_all
from handlers.email_recipients import MAX_RECIPIENTS
from handlers.email_templates import Email

MAIL = Email("Subject here", "Plain body", "<p>Html body</p>")
SEND = {"EMAIL_MODE": "send", "RESEND_API_KEY": "re_test", "EMAIL_FROM": "Forthright <a@b.dev>"}


class FakePost:
    def __init__(self, status=200):
        self.status, self.calls = status, []

    def __call__(self, url, headers, body):
        self.calls.append((url, headers, body))
        return self.status


def test_send_posts_one_message_per_recipient():
    post = FakePost()
    assert send_all("card_requested", ["a@x.org", "b@x.org"], MAIL, post=post, env=SEND) == 2
    assert [c[2]["to"] for c in post.calls] == [["a@x.org"], ["b@x.org"]]
    url, headers, body = post.calls[0]
    assert url == RESEND_URL == "https://api.resend.com/emails"
    assert headers["Authorization"] == "Bearer re_test" and headers["Content-Type"] == "application/json"
    assert body == {
        "from": "Forthright <a@b.dev>",
        "to": ["a@x.org"],
        "subject": "Subject here",
        "text": "Plain body",
        "html": "<p>Html body</p>",
    }


def test_log_mode_is_the_default_and_sends_nothing(caplog):
    post = FakePost()
    with caplog.at_level(logging.INFO):
        assert send_all("card_approved", ["a@x.org", "b@x.org"], MAIL, post=post, env={}) == 2
    assert post.calls == []
    assert "template=card_approved" in caplog.text and "recipients=2" in caplog.text
    assert "a@x.org" not in caplog.text and "Plain body" not in caplog.text


def test_modes():
    assert email_mode({}) == "log" and email_mode({"EMAIL_MODE": "nonsense"}) == "log"
    assert email_mode({"EMAIL_MODE": "send"}) == "send"
    assert email_mode({"EMAIL_MODE": "send", "FUNCTIONS_EMULATOR": "true"}) == "log"  # the emulator never sends
    assert app_url({"APP_URL": "https://x.web.app/"}) == "https://x.web.app"


def test_errors_are_swallowed_and_logged_without_addresses(caplog):
    post = FakePost(status=403)
    with caplog.at_level(logging.INFO):
        assert send_all("consent_confirmation", ["a@x.org", "b@x.org"], MAIL, post=post, env=SEND) == 0
    assert len(post.calls) == 2  # one failure doesn't stop the rest
    assert "status=403" in caplog.text and "template=consent_confirmation" in caplog.text
    assert "a@x.org" not in caplog.text


def test_a_post_that_raises_does_not_raise():
    def boom(*_):
        raise RuntimeError("network down a@x.org")

    assert send_all("t", ["a@x.org"], MAIL, post=boom, env=SEND) == 0


def test_a_missing_key_sends_nothing():
    post = FakePost()
    assert send_all("t", ["a@x.org"], MAIL, post=post, env={"EMAIL_MODE": "send"}) == 0
    assert post.calls == []


def test_recipients_are_capped_and_deduplicated():
    post = FakePost()
    addresses = [f"u{i}@x.org" for i in range(40)]
    assert send_all("t", addresses + addresses, MAIL, post=post, env=SEND) == MAX_RECIPIENTS
    assert len(post.calls) == MAX_RECIPIENTS


def test_nobody_to_email_does_nothing():
    post = FakePost()
    assert send_all("t", [], MAIL, post=post, env=SEND) == 0 and post.calls == []


def test_a_reply_to_address_is_added_when_set():
    post = FakePost()
    send_all("card_requested", ["a@x.org"], MAIL, post=post, env={**SEND, "EMAIL_REPLY_TO": "help@x.org"})
    assert post.calls[0][2]["reply_to"] == "help@x.org"

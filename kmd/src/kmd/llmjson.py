"""One place for 'ask the model for schema-valid JSON'. Used by tailoring and the email classifier."""
import json


class LLMError(Exception):
    pass


def ask_json(client, model, system, user, schema, effort="low", max_tokens=4096):
    resp = client.messages.create(
        model=model,
        max_tokens=max_tokens,
        system=system,
        output_config={"effort": effort, "format": {"type": "json_schema", "schema": schema}},
        messages=[{"role": "user", "content": user}],
    )
    if resp.stop_reason == "refusal":
        raise LLMError("model refused")
    text = next((b.text for b in resp.content if b.type == "text"), None)
    if text is None:
        raise LLMError("no text in response")
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise LLMError(f"bad JSON from model: {e}") from e

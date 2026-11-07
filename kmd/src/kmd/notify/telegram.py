import logging
import os

import httpx

from kmd.notify.base import LogNotifier, Notifier

log = logging.getLogger("kmd.telegram")
API = "https://api.telegram.org"


class TelegramNotifier(Notifier):
    def __init__(self, conn, token, chat_id, http=None):
        self.conn = conn
        self.token = token
        self.chat_id = str(chat_id)
        self.http = http or httpx.Client(timeout=40)

    def _call(self, method, **params):
        r = self.http.post(f"{API}/bot{self.token}/{method}", json=params)
        r.raise_for_status()
        data = r.json()
        if not data.get("ok"):
            raise RuntimeError(f"telegram {method}: {data}")
        return data["result"]

    def send(self, text, buttons=None):
        params = {"chat_id": self.chat_id, "text": text[:4000]}
        if buttons:
            params["reply_markup"] = {"inline_keyboard": [[{"text": l, "callback_data": d} for l, d in buttons]]}
        return str(self._call("sendMessage", **params)["message_id"])

    def _offset(self):
        row = self.conn.execute("SELECT v FROM kv WHERE k='tg_offset'").fetchone()
        return int(row[0]) if row else 0

    def poll_replies(self, timeout=0):
        """Long-poll getUpdates. The offset is persisted so a restart never replays old presses,
        and only presses from our own chat count."""
        updates = self._call("getUpdates", offset=self._offset(), timeout=timeout, allowed_updates=["callback_query"])
        out = []
        for u in updates:
            self.conn.execute(
                "INSERT OR REPLACE INTO kv (k, v) VALUES ('tg_offset', ?)", (str(u["update_id"] + 1),)
            )
            cq = u.get("callback_query")
            if not cq:
                continue
            chat = str(cq.get("message", {}).get("chat", {}).get("id", ""))
            try:
                self._call("answerCallbackQuery", callback_query_id=cq["id"])
            except Exception:
                log.warning("answerCallbackQuery failed", exc_info=True)
            if chat == self.chat_id:
                out.append(cq["data"])
        return out


def make_notifier(cfg, conn):
    token, chat = os.environ.get("TELEGRAM_BOT_TOKEN"), os.environ.get("TELEGRAM_CHAT_ID")
    if cfg["notifier"] == "log" or not (token and chat):
        if cfg["notifier"] == "telegram":
            raise SystemExit("notifier is 'telegram' but TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID are not set")
        return LogNotifier()
    return TelegramNotifier(conn, token, chat)

import html
import re
from html.parser import HTMLParser

MAX_CHARS = 6000  # plenty to judge fit; keeps AI cost per job small
_BLOCK = {"p", "div", "br", "li", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6", "tr"}
_SKIP = {"script", "style"}


class _Text(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self._skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in _SKIP:
            self._skip += 1
        elif tag in _BLOCK:
            self.parts.append("\n")
            if tag == "li":
                self.parts.append("- ")

    def handle_endtag(self, tag):
        if tag in _SKIP:
            self._skip = max(0, self._skip - 1)
        elif tag in _BLOCK and tag != "li":  # li already starts a new line
            self.parts.append("\n")

    def handle_data(self, data):
        if not self._skip:
            self.parts.append(data)


def html_to_text(raw, limit=MAX_CHARS):
    """Greenhouse sends HTML that is itself entity-escaped (&lt;p&gt;...), so unescape first."""
    if not raw:
        return ""
    p = _Text()
    p.feed(html.unescape(raw))
    text = html.unescape("".join(p.parts))
    text = re.sub(r"[ \t\r\f\v\xa0]+", " ", text)
    text = re.sub(r" ?\n ?", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return text[:limit]

"""Check generated navigation, local assets, metadata and feed consistency."""

from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urljoin, urlsplit
import json
import sys
import xml.etree.ElementTree as ET


class Document(HTMLParser):
    def __init__(self, path):
        super().__init__()
        self.links = []
        self.ids = set()
        self.canonical = None
        self.feed(path.read_text(encoding="utf-8"))

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if "id" in attrs:
            self.ids.add(attrs["id"])
        if tag == "link" and attrs.get("rel") == "canonical":
            self.canonical = attrs.get("href")
        for name in ("href", "src"):
            if name in attrs:
                self.links.append(attrs[name])


root = Path(sys.argv[1])
base = sys.argv[2].rstrip("/") if len(sys.argv) > 2 else ""
production_url = "https://1poorman.github.io"
pages = ["index.html", "archive/index.html", "experiments/index.html",
         "topics/index.html", "projects/index.html", "404.html",
         "page2/index.html", "page3/index.html", "page4/index.html"]
documents = {}
checked = 0


def document(file):
    if file not in documents:
        documents[file] = Document(file)
    return documents[file]


def file_for_url(path):
    relative = unquote(path)
    assert not base or relative.startswith(base + "/"), f"Missing baseurl: {path}"
    relative = relative[len(base):].lstrip("/")
    file = root / relative
    if file.is_dir():
        file = file / "index.html"
    return file


for name in pages:
    doc = document(root / name)
    route = "/" + name.removesuffix("index.html")
    assert doc.canonical == production_url + base + route, (name, doc.canonical)
    for link in doc.links:
        url = urlsplit(urljoin(production_url + base + route, link))
        if url.scheme != "https" or url.netloc != "1poorman.github.io":
            continue
        target = file_for_url(url.path)
        assert target.is_file(), f"{name}: broken internal resource: {link}"
        if url.fragment and target.suffix == ".html":
            assert unquote(url.fragment) in document(target).ids, f"{name}: missing section: {link}"
        checked += 1

corpus = json.loads((root / "assets/data/searchcorpus.json").read_text(encoding="utf-8"))
rss = ET.parse(root / "feed.xml")
sitemap = ET.parse(root / "sitemap.xml")
for post in corpus:
    assert file_for_url(post["url"]).is_file(), post["url"]
for location in sitemap.findall(".//{http://www.sitemaps.org/schemas/sitemap/0.9}loc"):
    assert location.text.startswith(production_url + base + "/"), location.text
assert len(rss.findall(".//item")) == min(len(corpus), 20)

print(f"Output OK ({base or '/'}): {len(pages)} pages, {checked} local links/resources, "
      f"{len(corpus)} search records, valid RSS/sitemap, production canonical URLs")

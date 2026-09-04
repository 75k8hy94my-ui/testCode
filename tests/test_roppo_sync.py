import unittest
from scripts.sync_roppo import kanji_number_to_int, normalize_article_references, parse_law_xml, is_stale
from datetime import datetime, timezone

SAMPLE_XML = '''<?xml version="1.0" encoding="UTF-8"?>
<Law><LawNum>令和元年法律第一号</LawNum><LawBody><LawTitle>試験法</LawTitle><MainProvision>
<Article Num="105"><ArticleCaption>（試験条文）</ArticleCaption><ArticleTitle>第百五条の二</ArticleTitle>
<Paragraph Num="1"><ParagraphNum></ParagraphNum><ParagraphSentence><Sentence>第百四条及び前二条の規定による。</Sentence></ParagraphSentence></Paragraph>
<Paragraph Num="2"><ParagraphNum>２</ParagraphNum><ParagraphSentence><Sentence>第二項に定める金額は三万円とする。</Sentence></ParagraphSentence></Paragraph>
</Article></MainProvision></LawBody></Law>'''

class SyncTests(unittest.TestCase):
    def test_kanji_number(self):
        self.assertEqual(kanji_number_to_int('百五'), 105)
        self.assertEqual(kanji_number_to_int('千二百三十四'), 1234)

    def test_normalizes_article_references_only(self):
        value = normalize_article_references('第百五条の二、前二条、三万円、第二項')
        self.assertEqual(value, '第105条の2、前2条、三万円、第二項')

    def test_parse_preserves_caption_and_paragraphs(self):
        law = parse_law_xml(SAMPLE_XML, 'TEST')
        article = law['articles'][0]
        self.assertEqual(article['number'], '第105条の2')
        self.assertEqual(article['caption'], '（試験条文）')
        self.assertEqual(len(article['paragraphs']), 2)
        self.assertEqual(article['paragraphs'][0]['number'], '1')
        self.assertIn('第104条', article['paragraphs'][0]['text'])
        self.assertIn('前2条', article['paragraphs'][0]['text'])
        self.assertIn('三万円', article['paragraphs'][1]['text'])

    def test_calendar_month_staleness(self):
        now = datetime(2026, 3, 1, tzinfo=timezone.utc)
        self.assertFalse(is_stale('2026-02-02T00:00:00+00:00', now))
        self.assertTrue(is_stale('2026-02-01T00:00:00+00:00', now))

if __name__ == '__main__':
    unittest.main()

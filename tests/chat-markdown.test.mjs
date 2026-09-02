import test from 'node:test';
import assert from 'node:assert/strict';
import ChatMarkdown from '../chat-markdown.js';

test('chat markdown escapes raw html and script content',()=>{
  const html=ChatMarkdown.render('<script>alert(1)</script><img src=x onerror=alert(1)>');
  assert.equal(html.includes('<script>'),false);
  assert.equal(html.includes('<img'),false);
  assert.match(html,/&lt;script&gt;/);
});

test('chat markdown only links http and https urls',()=>{
  const safe=ChatMarkdown.render('[safe](https://example.com/a?x=1&y=2)');
  assert.match(safe,/href="https:\/\/example\.com\/a\?x=1&amp;y=2"/);
  assert.match(safe,/rel="noopener noreferrer"/);
  for(const scheme of ['javascript:alert(1)','data:text/html,hi','file:///etc/passwd']){
    const html=ChatMarkdown.render(`[bad](${scheme})`);
    assert.equal(html.includes('<a '),false);
  }
});

test('chat markdown escapes code while supporting basic formatting',()=>{
  const html=ChatMarkdown.render('# Heading\n\n- one\n- two\n\n**bold** and `x < y`\n\n```js\n<script>bad()</script>\n```');
  assert.match(html,/<h1>Heading<\/h1>/);
  assert.match(html,/<ul>[\s\S]*<li>one<\/li>[\s\S]*<li>two<\/li>[\s\S]*<\/ul>/);
  assert.match(html,/<strong>bold<\/strong>/);
  assert.match(html,/<code>x &lt; y<\/code>/);
  assert.match(html,/<pre><code data-language="js">&lt;script&gt;bad\(\)&lt;\/script&gt;\n<\/code><\/pre>/);
});

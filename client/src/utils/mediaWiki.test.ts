// @ts-expect-error Node built-ins are available to the test runner but omitted from the app tsconfig.
import assert from 'node:assert/strict';
// @ts-expect-error Node built-ins are available to the test runner but omitted from the app tsconfig.
import test from 'node:test';

import { extractMediaWikiHeadings, renderMediaWiki } from './mediaWiki.js';

const BLACKSMITH_FIXTURE = `[[File:Blacksmith Yragbor.jpg|500px|thumb|right|[https://alla.clumsysworld.com/?a=npc&id=92110 Blacksmith Yragbor]]]
{| class="wikitable"
! colspan="2" style="text-align: center; font-weight:bold; background-color:#cd9934; color:#ffffff;" | Blacksmith Yragbor
|-
| style="font-weight:bold;" | Race:
| Giant
|-
| colspan="2" style="text-align: center; font-weight:bold;" | [[File:Blacksmith_Yragbor_Map.jpg]]
|}
----
=== Encounter NPCs and Abilities ===
* Already Spawned at Start - [[Blacksmith Yragbor]]
** Perma-rooted
** [https://alla.clumsysworld.com/?a=spell&id=1318 Muscle Spawm]
*** Snare
*** 5 Poison Counters

=== Heal Rotation ===
* 2 Person [[CH Chain and Audio Triggers#2_Person_CH_Chain| CH Chain]]<br>
* 3 Person [[CH Chain and Audio Triggers#3_Person_CH_Chain| CH Chain]]

[[Category:NPC]]
[[Category:Ancients]]`;

test('renders the Blacksmith Yragbor MediaWiki constructs structurally', () => {
  const html = renderMediaWiki(BLACKSMITH_FIXTURE, {
    resolveWikiLink(target) {
      return target === 'Blacksmith Yragbor' ? '/guilds/guild-1/bosses/yragbor' : null;
    }
  });

  assert.match(html, /class="wiki-file wiki-file--block wiki-file--thumb wiki-file--right"/);
  assert.match(html, /Special%3ARedirect%2Ffile%2FBlacksmith_Yragbor\.jpg&amp;width=500/);
  assert.match(html, />Blacksmith Yragbor<\/a><\/figcaption>/);
  assert.match(
    html,
    /<th colspan="2" style="text-align: center; font-weight: bold; background-color: #cd9934; color: #ffffff">Blacksmith Yragbor<\/th>/
  );
  assert.match(html, /<td style="font-weight: bold">Race:<\/td><td>Giant<\/td>/);
  assert.match(html, /wiki-file--inline/);
  assert.match(
    html,
    /<ul><li>Already Spawned at Start - <a class="wiki-link" href="\/guilds\/guild-1\/bosses\/yragbor" target="_blank" rel="noopener noreferrer">Blacksmith Yragbor<\/a><ul>/
  );
  assert.match(html, /Muscle Spawm<\/a><ul><li>Snare<\/li><li>5 Poison Counters<\/li><\/ul>/);
  assert.match(html, /title=CH_Chain_and_Audio_Triggers#2_Person_CH_Chain/);
  assert.match(html, /CH Chain<\/a><br><\/li>/);
  assert.match(html, /<nav class="wiki-categories" aria-label="Categories">/);
  assert.match(html, />NPC<\/a>/);
  assert.match(html, />Ancients<\/a>/);
  assert.doesNotMatch(html, /Category:NPC|colspan=&quot;|<br&gt;/);
});

test('opens rendered links in a new tab while preserving same-document anchors', () => {
  const html = renderMediaWiki(`=== Encounter NPCs ===
[[#Encounter NPCs|Jump to encounter]]
[[Blacksmith Yragbor|Boss page]]
[https://example.com External page]
[[Category:Ancients]]`, {
    resolveWikiLink(target) {
      return target === 'Blacksmith Yragbor'
        ? '/b/clumsy-s-world/blacksmith-yragbor'
        : null;
    }
  });

  assert.match(
    html,
    /href="#encounter-npcs">Jump to encounter<\/a>/
  );
  assert.doesNotMatch(html, /href="#encounter-npcs" target=/);
  assert.match(
    html,
    /href="\/b\/clumsy-s-world\/blacksmith-yragbor" target="_blank" rel="noopener noreferrer">Boss page<\/a>/
  );
  assert.match(
    html,
    /href="https:\/\/example\.com\/" target="_blank" rel="noopener noreferrer">External page<\/a>/
  );
  assert.match(
    html,
    /title=Category%3AAncients" target="_blank" rel="noopener noreferrer">Ancients<\/a>/
  );
});

test('keeps untrusted HTML and table styles inert', () => {
  const html = renderMediaWiki(`<script>alert('x')</script>
[javascript:alert(1) unsafe]
{| class="wikitable"
| style="background-image:url(javascript:alert(1)); position:fixed; color:#fff;" | Safe cell
|}`);

  assert.match(html, /&lt;script&gt;alert\('x'\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script|href="javascript:|background-image|position: fixed/);
  assert.match(html, /style="color: #fff"/);
});

test('honors disabled file links and rejects protocol-relative resolved links', () => {
  const html = renderMediaWiki('[[File:Map.jpg|link=|100px]] [[Unsafe]]', {
    resolveWikiLink() {
      return '//example.com/escaped';
    }
  });

  assert.match(html, /<img [^>]+><\/span>/);
  assert.doesNotMatch(html, /wiki-file__link/);
  assert.doesNotMatch(html, /href="\/\/example\.com/);
  assert.match(html, /wiki-link--external-wiki/);
});

test('parses file options when a boss name contains an apostrophe', () => {
  const html = renderMediaWiki(
    "[[File:Grand Magus D'Nor.jpg|500px|thumb|right|Grand Magus D'Nor]]"
  );

  assert.match(html, /wiki-file--thumb wiki-file--right/);
  assert.match(html, /Special%3ARedirect%2Ffile%2FGrand_Magus_D%27Nor\.jpg&amp;width=500/);
  assert.doesNotMatch(html, /Nor\.jpg%7C500px/);
});

test('matches MediaWiki paragraph, formatting, and heading behavior', () => {
  const html = renderMediaWiki(`=== First Section ===
One line
continues the paragraph with '''bold''' and ''italic''.

=== First Section ===
<nowiki>[[literal]]</nowiki> and <code>code</code>.`);

  assert.match(
    html,
    /<h3 id="first-section" class="wiki-heading wiki-heading--major wiki-heading--first">First Section<\/h3>/
  );
  assert.match(
    html,
    /<h3 id="first-section-2" class="wiki-heading wiki-heading--major">First Section<\/h3>/
  );
  assert.match(
    html,
    /One line continues the paragraph with <strong>bold<\/strong> and <em>italic<\/em>\./
  );
  assert.match(html, /\[\[literal\]\] and <code>code<\/code>/);
});

test('extracts a stable wiki outline without treating table content as page sections', () => {
  const outline = extractMediaWikiHeadings(`<!-- hidden -->
=== Strategy & Positioning ===
{| class="wikitable"
| === Not a heading ===
|}
==== Adds ====
===== Burn order =====
=== Strategy & Positioning ===`);

  assert.deepEqual(outline, [
    { id: 'strategy-positioning', label: 'Strategy & Positioning', level: 3 },
    { id: 'adds', label: 'Adds', level: 4 },
    { id: 'burn-order', label: 'Burn order', level: 5 },
    { id: 'strategy-positioning-2', label: 'Strategy & Positioning', level: 3 }
  ]);
});

#!/usr/bin/env node
// scripts/test-open-letter.mjs — the open-letter page's rules, proved in-process (npm run test:letter; Node's type
// stripping imports the TypeScript rules directly): the clock forms the letter and the enclosure use all become links
// to the recording at the right second, a range to its start, nothing that is not a time does; the remark plugin
// links every time the pattern finds in the imported content and leaves text inside links and code alone; the
// transcript's turns run forward and a second maps to the turn in progress. Exit 1 on the first failure.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { DEBATE_TIME_RE, clockSeconds, clockLabel, recordingUrl, secondsFromRecordingUrl, turnAt, OPEN_LETTER_SLUG } from '../src/lib/open-letter.ts';
import remarkDebateTimes from '../src/lib/remark-debate-times.ts';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const ID = 'pgzvG1Ky8rQ';
let n = 0;
const ok = (name) => { n++; console.log(`  ok  ${name}`); };
const times = (s) => [...s.matchAll(DEBATE_TIME_RE)].map((m) => [m[0], clockSeconds(m[1]), m[2] ?? null]);

// ---- the clock
assert.equal(clockSeconds('2:49'), 169); assert.equal(clockSeconds('12:37'), 757); assert.equal(clockSeconds('00:12:37'), 757);
assert.equal(clockSeconds('1:02:03'), 3723); assert.equal(clockSeconds('8.31'), null); assert.equal(clockSeconds('a:bc'), null);
assert.equal(clockLabel(169), '2:49'); assert.equal(clockLabel(757), '12:37'); assert.equal(clockLabel(3723), '1:02:03');
assert.equal(recordingUrl(ID, 169), `https://www.youtube.com/watch?v=${ID}&t=169s`);
assert.equal(secondsFromRecordingUrl(`https://www.youtube.com/watch?v=${ID}&t=169s`, ID), 169);
assert.equal(secondsFromRecordingUrl('https://www.youtube.com/watch?v=other&t=169s', ID), null);
assert.equal(secondsFromRecordingUrl(undefined, ID), null);
ok('clock forms, labels, the recording URL and its reading back');

// ---- the pattern on the texts' own forms
assert.deepEqual(times('Mr. Ellison, at 2:49: "Minnesota Statute'), [['2:49', 169, null]], 'a time before a colon');
assert.deepEqual(times('12:37–12:52: "They\'re'), [['12:37–12:52', 757, '12:52']], 'a range before a colon links to its start');
assert.deepEqual(times('at 22:07–23:26, on the ICE'), [['22:07–23:26', 1327, '23:26']]);
assert.deepEqual(times('16:14/16:24').map((t) => t[1]), [974, 984], 'two times either side of a slash');
assert.deepEqual(times('2:49, 12:37, 21:19 and 44:06; Mr. Schutz, 4:34, 10:31').map((t) => t[1]), [169, 757, 1279, 2646, 274, 631]);
assert.deepEqual(times('Time 00:12:37 on'), [['00:12:37', 757, null]], 'a transcript clock is read whole');
assert.deepEqual(times('at 9:00.'), [['9:00', 540, null]]);
assert.deepEqual(times('No. 0:26-cv-02594 (D. Minn.)'), [], 'a docket prefix is not a time');
assert.deepEqual(times('§ 8.31, subd. 1; Doc. 16 at 5; ratio 3:99; (612) 552-2122; 3:1234'), [], 'statutes, record cites, phone numbers, bad minutes, digits after');
ok('the pattern: colons, ranges, slashes, lists, transcript clocks; no docket, statute or phone');

// ---- the plugin over markdown
const tree = (md) => unified().use(remarkParse).use(remarkGfm).use(remarkDebateTimes, { youtubeId: ID }).runSync(unified().use(remarkParse).use(remarkGfm).parse(md));
const links = (node, out = []) => { if (node.type === 'link') out.push(node); (node.children || []).forEach((c) => links(c, out)); return out; };
const t1 = tree('Mr. Ellison, at 2:49: "shall"; 22:07–23:26 on ICE; [12:37](https://example.org/x) and `at 4:34` and no 8.31.');
const l1 = links(t1);
assert.deepEqual(l1.map((l) => l.url), [recordingUrl(ID, 169), recordingUrl(ID, 1327), 'https://example.org/x'], 'two times linked; the existing link and the code span untouched');
assert.equal(l1[1].children[0].value, '22:07–23:26', 'the range keeps its whole text');
assert.equal(l1[1].title, 'The recording at 22:07 (to 23:26)');
ok('the plugin links times, leaves links and code alone, titles a range');

// ---- the imported content, when it is on disk
const file = resolve(ROOT, 'content', 'correspondence', `${OPEN_LETTER_SLUG}.json`);
if (existsSync(file)) {
  const c = JSON.parse(readFileSync(file, 'utf8'));
  for (const [name, md] of [['letter', c.letter.markdown], ['enclosure', c.enclosure.markdown], ['method', c.transcript.method]]) {
    const expected = times(md).length;
    const got = links(tree(md)).filter((l) => secondsFromRecordingUrl(l.url, ID) != null).length;
    assert.equal(got, expected, `${name}: every time the pattern finds becomes a link (${got} of ${expected})`);
    assert.ok(expected > 0 || name === 'method', `${name}: has times`);
    assert.ok(!/<!--|LEGAL-ANALYSIS-SIG|^---\n/.test(md), `${name}: nothing stripped survives`);
  }
  assert.ok(!/~\/|[0-9a-f]{8}-[0-9a-f]{4}|drafter [0-9a-f]{8}/.test(`${c.transcript.source} ${c.transcript.method}`), 'the served header carries no local path or seat');
  const turns = c.transcript.turns;
  assert.ok(turns.length >= 100 && turns.every((r, i) => r.n === i + 1 && (i === 0 || r.t >= turns[i - 1].t)), 'turns numbered and ascending');
  assert.equal(turnAt(turns, 0).n, 1); assert.equal(turnAt(turns, 169).time <= '00:02:49', true);
  const at = turnAt(turns, 169); const next = turns[at.n]; assert.ok(at.t <= 169 && (!next || next.t > 169), 'the turn in progress at 2:49');
  assert.equal(turnAt([], 5), undefined);
  assert.equal(c.recording.youtube_id, ID);
  ok(`the imported content: ${turns.length} turns; ${times(c.letter.markdown).length} times in the letter, ${times(c.enclosure.markdown).length} in the enclosure, all linked`);
} else {
  console.log('  --  content/correspondence not on disk: the content checks did not run');
}
console.log(`test-open-letter: ${n} groups passed`);

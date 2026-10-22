import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extractLinks, isWebLink } from '../src/shared/links.js';
import { suggestTags, type TagSource } from '../src/shared/tags.js';

const source = (fields: Partial<TagSource>): TagSource => ({
  title: '',
  artist: null,
  track: null,
  album: null,
  uploader: null,
  ...fields,
});

describe('suggestTags', () => {
  it('uses the artist, track and album YouTube Music provides', () => {
    assert.deepEqual(suggestTags(source({ title: 'Hello', artist: 'Adele', track: 'Hello', album: '25' })), {
      artist: 'Adele',
      title: 'Hello',
      album: '25',
    });
  });

  it('splits "Artist - Title" and removes video noise', () => {
    assert.deepEqual(suggestTags(source({ title: 'Daft Punk - Get Lucky (Official Music Video)', uploader: 'DaftPunkVEVO' })), {
      artist: 'Daft Punk',
      title: 'Get Lucky',
      album: '',
    });
    assert.equal(suggestTags(source({ title: 'Artist – Song [Official Audio] (Lyrics)' })).title, 'Song');
  });

  it('drops a repeated artist from the title', () => {
    assert.equal(suggestTags(source({ title: 'Adele - Hello (Official Video)', artist: 'Adele' })).title, 'Hello');
  });

  it('falls back to the channel name without " - Topic" or "VEVO"', () => {
    assert.deepEqual(suggestTags(source({ title: 'Some Song', uploader: 'Some Band - Topic' })), {
      artist: 'Some Band',
      title: 'Some Song',
      album: '',
    });
    assert.equal(suggestTags(source({ title: 'Song', uploader: 'AdeleVEVO' })).artist, 'Adele');
  });
});

describe('extractLinks', () => {
  it('finds every distinct link in pasted text, without trailing punctuation', () => {
    const text = 'first https://youtu.be/a, then (https://www.youtube.com/watch?v=b).\nhttps://youtu.be/a again';
    assert.deepEqual(extractLinks(text), ['https://youtu.be/a', 'https://www.youtube.com/watch?v=b']);
  });

  it('reads a dropped uri-list', () => {
    assert.deepEqual(extractLinks('# comment\r\nhttps://a.example/1\r\nhttps://b.example/2'), [
      'https://a.example/1',
      'https://b.example/2',
    ]);
  });

  it('finds nothing in a search phrase', () => {
    assert.deepEqual(extractLinks('daft punk – get lucky'), []);
    assert.equal(isWebLink('daft punk'), false);
    assert.equal(isWebLink(' https://youtu.be/a '), true);
  });
});

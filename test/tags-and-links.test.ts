import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { extractLinks, isWebLink } from '@shared/links.js'
import { suggestTags, type TagSource } from '@shared/tags.js'

const source = (fields: Partial<TagSource>): TagSource => ({
  title: '',
  artist: null,
  track: null,
  album: null,
  uploader: null,
  ...fields,
})

describe('suggestTags', () => {
  it('uses the artist, track and album YouTube Music provides', () => {
    assert.deepEqual(
      suggestTags(source({ title: 'Blue Sky', artist: 'Example Singer', track: 'Blue Sky', album: 'Debut' })),
      { artist: 'Example Singer', title: 'Blue Sky', album: 'Debut' },
    )
  })

  it('splits "Artist - Title" and removes video noise', () => {
    assert.deepEqual(
      suggestTags(source({ title: 'The Examples - Summer Song (Official Music Video)', uploader: 'TheExamplesVEVO' })),
      { artist: 'The Examples', title: 'Summer Song', album: '' },
    )
    assert.equal(suggestTags(source({ title: 'Artist – Song [Official Audio] (Lyrics)' })).title, 'Song')
  })

  it('drops a repeated artist from the title', () => {
    assert.equal(
      suggestTags(source({ title: 'Example Singer - Blue Sky (Official Video)', artist: 'Example Singer' })).title,
      'Blue Sky',
    )
  })

  it('falls back to the channel name without " - Topic" or "VEVO"', () => {
    assert.deepEqual(suggestTags(source({ title: 'Some Song', uploader: 'Some Band - Topic' })), {
      artist: 'Some Band',
      title: 'Some Song',
      album: '',
    })
    assert.equal(suggestTags(source({ title: 'Song', uploader: 'ExampleSingerVEVO' })).artist, 'ExampleSinger')
  })
})

describe('extractLinks', () => {
  it('finds every distinct link in pasted text, without trailing punctuation', () => {
    const text = 'first https://youtu.be/a, then (https://www.youtube.com/watch?v=b).\nhttps://youtu.be/a again'

    assert.deepEqual(extractLinks(text), ['https://youtu.be/a', 'https://www.youtube.com/watch?v=b'])
  })

  it('reads a dropped uri-list', () => {
    assert.deepEqual(extractLinks('# comment\r\nhttps://a.example/1\r\nhttps://b.example/2'), [
      'https://a.example/1',
      'https://b.example/2',
    ])
  })

  it('finds nothing in a search phrase', () => {
    assert.deepEqual(extractLinks('the examples – summer song'), [])
    assert.equal(isWebLink('the examples'), false)
    assert.equal(isWebLink(' https://youtu.be/a '), true)
  })
})

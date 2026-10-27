import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseMediaInfo } from '@server/services/ytdlp/media-info.js'
import { vimeoPlayerLink } from '@server/services/ytdlp/vimeo-links.js'
import { linkArguments } from '@server/services/ytdlp/ytdlp-command.js'
import { argumentsFor } from './support/download-arguments.js'

describe('vimeoPlayerLink', () => {
  it('reads a Vimeo video page through its player, which needs no login', () => {
    assert.equal(
      vimeoPlayerLink('https://vimeo.com/1237176348?fl=wc&source_section=317&source_position=1'),
      'https://player.vimeo.com/video/1237176348',
    )
    assert.equal(vimeoPlayerLink('https://www.vimeo.com/76979871/'), 'https://player.vimeo.com/video/76979871')
  })

  it('keeps the hash of an unlisted video', () => {
    assert.equal(
      vimeoPlayerLink('https://vimeo.com/76979871/8272b6c2e1?share=copy'),
      'https://player.vimeo.com/video/76979871?h=8272b6c2e1',
    )
  })

  it('leaves every other link as it is', () => {
    for (const url of [
      'https://player.vimeo.com/video/76979871',
      'https://vimeo.com/channels/staffpicks/76979871',
      'https://vimeo.com/showcase/9876543',
      'https://vimeo.com/someuser',
      'https://www.youtube.com/watch?v=abc',
    ])
      assert.equal(vimeoPlayerLink(url), url)
  })

  it('is what every yt-dlp call is given, after --', () => {
    assert.deepEqual(linkArguments('https://vimeo.com/1237176348'), ['--', 'https://player.vimeo.com/video/1237176348'])
    assert.deepEqual(linkArguments('https://www.youtube.com/watch?v=abc'), [
      '--',
      'https://www.youtube.com/watch?v=abc',
    ])
  })

  it('keeps the pasted link for the panel, the download and history', () => {
    const pastedLink = 'https://vimeo.com/1237176348?fl=wc'
    const info = parseMediaInfo(
      { id: '1237176348', title: 'Pipes', webpage_url: 'https://player.vimeo.com/video/1237176348', formats: [] },
      pastedLink,
    )

    assert.equal(info.url, pastedLink)
  })

  it('is what a download hands to yt-dlp', () => {
    const ytdlpArguments = argumentsFor({ url: 'https://vimeo.com/1237176348' })

    assert.equal(ytdlpArguments.at(-1), 'https://player.vimeo.com/video/1237176348')
  })
})

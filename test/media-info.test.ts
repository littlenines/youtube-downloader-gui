import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { choosePreviewFormat } from '../src/server/services/preview.js';
import { friendlyErrorMessage, parseMediaInfo, parseOutputLine, parseSearchResults } from '../src/server/services/ytdlp.js';

/** A trimmed-down version of what `yt-dlp -J` returns for a YouTube video. */
const videoOutput = {
  id: 'abc',
  title: 'Test video',
  uploader: 'Someone',
  webpage_url: 'https://www.youtube.com/watch?v=abc',
  thumbnail: 'https://i.ytimg.com/vi/abc/maxresdefault.jpg',
  duration: 200,
  view_count: 1234,
  subtitles: { en: [], live_chat: [] },
  formats: [
    { format_note: 'storyboard', ext: 'mhtml', vcodec: 'none', acodec: 'none' },
    { ext: 'm4a', acodec: 'mp4a.40.2', vcodec: 'none', abr: 129, filesize: 3_000_000 },
    { ext: 'webm', acodec: 'opus', vcodec: 'none', abr: 140, filesize: 3_200_000 },
    { ext: 'mp4', vcodec: 'avc1.640028', acodec: 'none', width: 1920, height: 1080, fps: 60, filesize: 50_000_000 },
    {
      ext: 'webm',
      vcodec: 'vp09.00.51.08',
      acodec: 'none',
      width: 3840,
      height: 2160,
      fps: 60,
      filesize: 400_000_000,
      dynamic_range: 'HDR10',
    },
    { ext: 'mp4', vcodec: 'av01.0.08M.08', acodec: 'none', width: 1920, height: 1080, fps: 60, filesize: 40_000_000 },
    { ext: 'mp4', vcodec: 'avc1.4d401f', acodec: 'none', width: 1280, height: 720, fps: 30, filesize_approx: 20_000_000 },
    { ext: 'mp4', vcodec: 'avc1', acodec: 'none', width: 1920, height: 1080, fps: 30, format_note: '1080p Premium' },
  ],
};

describe('parseMediaInfo: video', () => {
  const info = parseMediaInfo(videoOutput, 'https://www.youtube.com/watch?v=abc&list=PL123');
  if (info.kind !== 'video') throw new Error('Expected a video.');
  const [ultraHd, fullHd] = info.qualities;

  it('lists one row per resolution, best first, with frame rate and codecs', () => {
    assert.deepEqual(
      info.qualities.map((quality) => quality.label),
      ['2160p60', '1080p60', '720p'],
    );
    assert.deepEqual(fullHd?.codecs.sort(), ['AV1', 'H.264']);
    assert.equal(fullHd?.hasH264, true);
    assert.equal(ultraHd?.tag, '4K');
    assert.equal(ultraHd?.hdr, true);
  });

  it('adds the best audio to each size estimate', () => {
    assert.equal(fullHd?.estimatedBytes, 50_000_000 + 3_200_000);
  });

  it('picks the highest-bitrate audio and skips storyboards and Premium formats', () => {
    assert.deepEqual(info.audio, { codec: 'Opus', bitrateKbps: 140, sizeBytes: 3_200_000 });
  });

  it('notices a playlist in the link and ignores live chat as a subtitle', () => {
    assert.equal(info.playlistId, 'PL123');
    assert.deepEqual(info.subtitleLanguages, ['en']);
  });

  it('treats vertical video by its short side (1080x1920 is 1080p)', () => {
    const vertical = parseMediaInfo({ formats: [{ vcodec: 'avc1', width: 1080, height: 1920, fps: 30 }] }, 'https://x');
    assert.equal(vertical.kind === 'video' && vertical.qualities[0]?.label, '1080p');
  });
});

describe('parseMediaInfo: playlist', () => {
  it('summarises the entries and skips unavailable ones', () => {
    const playlist = parseMediaInfo(
      {
        _type: 'playlist',
        title: 'Mix',
        entries: [{ title: 'a', duration: 60, url: 'u1' }, null, { title: 'b', duration: 30, url: 'u2' }],
      },
      'https://x',
    );
    assert.equal(playlist.kind, 'playlist');
    if (playlist.kind !== 'playlist') return;
    assert.equal(playlist.videoCount, 2);
    assert.equal(playlist.durationSeconds, 90);
  });
});

describe('friendlyErrorMessage', () => {
  it('turns yt-dlp errors into plain sentences', () => {
    assert.match(friendlyErrorMessage('ERROR: [youtube] abc: Sign in to confirm your age'), /age-restricted/);
    assert.match(friendlyErrorMessage('ERROR: [youtube] abc: Private video. Sign in'), /private/);
    assert.equal(
      friendlyErrorMessage('WARNING: something\nERROR: [generic] Unsupported URL: https://x'),
      'That link is not a video yt-dlp supports.',
    );
  });

  it('falls back to the last line when there is no error line', () => {
    assert.equal(friendlyErrorMessage('first\nsomething broke\n'), 'something broke');
  });
});

describe('parseSearchResults', () => {
  it('turns flat search entries into results', () => {
    const [result] = parseSearchResults({
      entries: [
        {
          id: 'abc',
          title: 'Song',
          channel: 'Band',
          duration: 200,
          view_count: 5,
          thumbnails: [{ url: 'small.jpg' }, { url: 'large.jpg' }],
        },
        null,
      ],
    });
    assert.deepEqual(result, {
      title: 'Song',
      url: 'https://www.youtube.com/watch?v=abc',
      channel: 'Band',
      durationSeconds: 200,
      viewCount: 5,
      thumbnailUrl: 'large.jpg',
    });
  });
});

describe('choosePreviewFormat', () => {
  it('prefers a stream with picture and sound, up to 720p', () => {
    const choice = choosePreviewFormat([
      { format_id: '18', url: 'u18', protocol: 'https', vcodec: 'avc1', acodec: 'mp4a', height: 360 },
      { format_id: '137', url: 'u137', protocol: 'https', vcodec: 'avc1', acodec: 'none', height: 1080 },
      { format_id: 'hls', url: 'uhls', protocol: 'm3u8_native', vcodec: 'avc1', acodec: 'mp4a', height: 720 },
    ]);
    assert.deepEqual([choice?.kind, choice?.format.format_id], ['video', '18']);
  });

  it('otherwise picks plain stereo M4A audio', () => {
    const choice = choosePreviewFormat([
      { format_id: '140-drc', url: 'a', protocol: 'https', vcodec: 'none', acodec: 'mp4a', ext: 'm4a', abr: 129 },
      { format_id: '258', url: 'b', protocol: 'https', vcodec: 'none', acodec: 'mp4a', ext: 'm4a', abr: 388, audio_channels: 6 },
      { format_id: '251', url: 'c', protocol: 'https', vcodec: 'none', acodec: 'opus', ext: 'webm', abr: 140 },
      { format_id: '140', url: 'd', protocol: 'https', vcodec: 'none', acodec: 'mp4a', ext: 'm4a', abr: 129 },
    ]);
    assert.deepEqual([choice?.kind, choice?.format.format_id], ['audio', '140']);
  });

  it('returns nothing when no stream can be played directly', () => {
    assert.equal(choosePreviewFormat([{ url: 'x', protocol: 'm3u8_native', vcodec: 'avc1', acodec: 'mp4a' }]), null);
  });
});

describe('parseOutputLine', () => {
  it('tells picture, sound, combined and other streams apart by their codecs', () => {
    const streamOf = (line: string) => {
      const event = parseOutputLine(line);
      return event?.type === 'progress' ? event.stream : null;
    };
    assert.equal(streamOf('VPROG av01.0.01M.08|none|1000|5000|200|20'), 'picture');
    assert.equal(streamOf('VPROG none|mp4a.40.2|1000|5000|200|20'), 'sound');
    assert.equal(streamOf('VPROG avc1|mp4a.40.2|1000|5000|200|20'), 'combined');
    assert.equal(streamOf('VPROG NA|NA|440|NA|NA|NA'), 'other');
  });

  it('reads the numbers, treating NA as unknown', () => {
    assert.deepEqual(parseOutputLine('VPROG none|opus|1000|NA|250.5|NA'), {
      type: 'progress',
      stream: 'sound',
      downloadedBytes: 1000,
      totalBytes: null,
      bytesPerSecond: 250.5,
      secondsLeft: null,
    });
  });

  it('reads items, keeping a "|" inside the title, and finished files', () => {
    assert.deepEqual(parseOutputLine('VITEM 2|10|Song | Live'), { type: 'item', index: 2, count: 10, title: 'Song | Live' });
    assert.deepEqual(parseOutputLine('VFILE /music/Song.mp3'), { type: 'file', file: '/music/Song.mp3' });
    assert.equal(parseOutputLine('[download] something else'), null);
  });
});

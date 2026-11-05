// The one-minute promo (also the YouTube channel trailer), served from this site so watching it involves no other
// company. Nothing downloads until the visitor presses play. Made in ~/Documents/Products/forthright-promo-video; the
// file names carry a date so a new cut can be cached for good under a new name.
const VIDEO = '/media/forthright-promo-2026-11.mp4';
const POSTER = '/media/forthright-promo-poster-2026-11.jpg';

export function PromoVideo() {
  return (
    <section className="l-section l-video" aria-labelledby="video-title">
      <div className="l-wrap">
        <p className="l-label">Video</p>
        <h2 id="video-title">Forthright in a minute</h2>
        <video
          className="l-video-player"
          controls
          playsInline
          preload="none"
          poster={POSTER}
          width={1920}
          height={1080}
          aria-describedby="video-note"
        >
          <source src={VIDEO} type="video/mp4" />
        </video>
        <p id="video-note" className="l-small">
          68 seconds, with music and no narration. It shows the roster, advancement paths and blue
          cards, trip planning, the calendar, event sign-ups, Scout accounts and a troop website,
          using a made-up troop.{' '}
          <a href={VIDEO} download>
            Download the video
          </a>
        </p>
      </div>
    </section>
  );
}

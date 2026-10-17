import { useState } from 'react';
import { type Block, type DraftPage, move, PAGE_LIMITS, pageAddress, pageProblem, pageSlug } from '../../lib/sitePages';
import { useTroop } from '../../lib/troop';
import { Field, Notice } from '../ui';
import { BlockEditor } from './BlockEditor';
import { ImageUpload } from './ImageUpload';

interface Props {
  troopId: string;
  siteSlug: string;
  page: DraftPage;
  all: DraftPage[];
  index: number;
  onChange: (page: DraftPage) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}

const NEW_BLOCKS: [string, () => Block][] = [
  ['Heading', () => ({ type: 'heading', text: '' })],
  ['Paragraph', () => ({ type: 'paragraph', inline: [] })],
  ['Bullet list', () => ({ type: 'list', items: [[]] })],
];

/** One extra page: title, web address, menu position and its content blocks. */
export function PageCard({ troopId, siteSlug, page, all, index, onChange, onMove, onRemove }: Props) {
  const { members } = useTroop();
  const scouts = members.filter((m) => m.kind === 'scout');
  const [open, setOpen] = useState(page.blocks.length === 0);
  const n = index + 1;
  const problem = pageProblem(page, all);
  const setBlocks = (blocks: Block[]) => onChange({ ...page, blocks });
  const setTitle = (title: string) => {
    const follows = page.slug === pageSlug(page.title) || /^page-\d+$/.test(page.slug);
    onChange({ ...page, title, slug: follows && pageSlug(title) ? pageSlug(title) : page.slug });
  };

  return (
    <div className="card" style={{ background: 'transparent' }}>
      <div className="row">
        <strong>
          Page {n}: {page.title || 'Untitled'}
        </strong>
        <button type="button" className="btn quiet small" disabled={index === 0} onClick={() => onMove(-1)}>
          Move page {n} up
        </button>
        <button type="button" className="btn quiet small" disabled={index === all.length - 1} onClick={() => onMove(1)}>
          Move page {n} down
        </button>
        <button type="button" className="btn quiet small" onClick={onRemove}>
          Remove page {n}
        </button>
      </div>
      <Field label={`Page ${n} title`} htmlFor={`page-title-${n}`}>
        <input id={`page-title-${n}`} maxLength={PAGE_LIMITS.title} value={page.title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field
        label={`Page ${n} web address`}
        htmlFor={`page-slug-${n}`}
        hint={`Lowercase letters, numbers and dashes. ${pageAddress(window.location.origin, siteSlug, page.slug || 'page')}`}
      >
        <input
          id={`page-slug-${n}`}
          maxLength={40}
          value={page.slug}
          autoCapitalize="off"
          spellCheck={false}
          onChange={(e) => onChange({ ...page, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
        />
      </Field>
      <Notice kind="error">{problem}</Notice>
      <div>
        <button type="button" className="btn secondary small" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? `Hide page ${n} content` : `Edit page ${n} content`}
        </button>
      </div>
      {open ? (
        <div className="stack">
          {page.blocks.length === 0 ? <p className="muted small">Nothing here yet. Add a heading, text, a list or an image.</p> : null}
          {page.blocks.map((block, i) => (
            <BlockEditor
              key={i}
              block={block}
              n={i + 1}
              count={page.blocks.length}
              scouts={scouts}
              onChange={(next) => setBlocks(page.blocks.map((b, k) => (k === i ? next : b)))}
              onMove={(by) => setBlocks(move(page.blocks, i, i + by))}
              onRemove={() => setBlocks(page.blocks.filter((_, k) => k !== i))}
            />
          ))}
          {page.blocks.length < PAGE_LIMITS.blocks ? (
            <div className="row">
              {NEW_BLOCKS.map(([label, make]) => (
                <button
                  key={label}
                  type="button"
                  className="btn secondary small"
                  onClick={() => setBlocks([...page.blocks, make()])}
                >
                  Add {label.toLowerCase()} to page {n}
                </button>
              ))}
            </div>
          ) : null}
          <ImageUpload
            troopId={troopId}
            kind="photo"
            label={`Add an image to page ${n}`}
            hint="PNG, JPEG, GIF or WebP, up to 8 MB. Tag any Scouts who appear; images follow the same media-consent rule as photos."
            onUploaded={(path) =>
              onChange({
                ...page,
                blocks: [...page.blocks, { type: 'image', path, alt: '', scoutIds: [], noScoutsShown: false }],
              })
            }
          />
        </div>
      ) : null}
    </div>
  );
}

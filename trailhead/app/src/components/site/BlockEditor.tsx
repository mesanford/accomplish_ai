import { formatInline, type Block, listToText, PAGE_LIMITS, parseInline, textToList } from '../../lib/sitePages';
import type { Member } from '../../lib/types';
import { Field } from '../ui';
import { ScoutTags } from './ScoutTags';
import { StoredImage } from './StoredImage';

interface Props {
  block: Block;
  /** 1-based position on the page, for labels. */
  n: number;
  count: number;
  scouts: Member[];
  onChange: (block: Block) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}

const KIND: Record<Block['type'], string> = { heading: 'Heading', paragraph: 'Paragraph', list: 'Bullet list', image: 'Image' };
const LINK_HINT = 'To add a link, write [words](https://address). Links can start with https://, http:// or mailto:.';

function Body({ block, n, scouts, onChange }: Pick<Props, 'block' | 'n' | 'scouts' | 'onChange'>) {
  const id = `block-${n}`;
  if (block.type === 'heading') {
    return (
      <Field label={`Block ${n} heading`} htmlFor={id}>
        <input id={id} maxLength={PAGE_LIMITS.heading} value={block.text} onChange={(e) => onChange({ ...block, text: e.target.value })} />
      </Field>
    );
  }
  if (block.type === 'paragraph') {
    return (
      <Field label={`Block ${n} paragraph`} htmlFor={id} hint={LINK_HINT}>
        <textarea
          id={id}
          value={formatInline(block.inline)}
          onChange={(e) => onChange({ ...block, inline: parseInline(e.target.value) })}
        />
      </Field>
    );
  }
  if (block.type === 'list') {
    return (
      <Field label={`Block ${n} bullet list`} htmlFor={id} hint={`One item per line, up to ${PAGE_LIMITS.items}. ${LINK_HINT}`}>
        <textarea id={id} value={listToText(block.items)} onChange={(e) => onChange({ ...block, items: textToList(e.target.value) })} />
      </Field>
    );
  }
  return (
    <div className="stack">
      <StoredImage path={block.path} alt={block.alt || `Image ${n}`} />
      <Field label={`Block ${n} image description`} htmlFor={id} hint="Say what the image shows, for people who can't see it.">
        <input id={id} maxLength={200} value={block.alt} onChange={(e) => onChange({ ...block, alt: e.target.value })} />
      </Field>
      <ScoutTags
        subject={`image ${n}`}
        noun="image"
        tags={block}
        scouts={scouts}
        onChange={(tags) => onChange({ ...block, ...tags })}
      />
    </div>
  );
}

/** One block on a page: its fields, and buttons to reorder or remove it. */
export function BlockEditor(props: Props) {
  const { block, n, count } = props;
  return (
    <div className="card" style={{ background: 'transparent' }}>
      <div className="row">
        <strong className="small">
          {n}. {KIND[block.type]}
        </strong>
        <button type="button" className="btn quiet small" disabled={n === 1} onClick={() => props.onMove(-1)}>
          Move block {n} up
        </button>
        <button type="button" className="btn quiet small" disabled={n === count} onClick={() => props.onMove(1)}>
          Move block {n} down
        </button>
        <button type="button" className="btn quiet small" onClick={props.onRemove}>
          Remove block {n}
        </button>
      </div>
      <Body {...props} />
    </div>
  );
}

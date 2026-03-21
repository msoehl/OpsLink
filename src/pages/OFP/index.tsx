import { useEFBStore } from '../../store/efbStore';
import { ScrollText } from 'lucide-react';

function cleanHtml(html: string): string {
  return html
    .replace(/<html[^>]*>/gi, '')
    .replace(/<\/html>/gi, '')
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
    .replace(/<body[^>]*>/gi, '')
    .replace(/<\/body>/gi, '');
}

export default function OFP() {
  const { ofp } = useEFBStore();

  if (!ofp) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500">
        <ScrollText size={40} className="mb-3" />
        <p>No flight plan loaded. Go to Dashboard to load SimBrief OFP.</p>
      </div>
    );
  }

  const html = ofp.text?.plan_html ? cleanHtml(ofp.text.plan_html) : null;

  if (!html) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500">
        <ScrollText size={40} className="mb-3" />
        <p>No OFP text available in this flight plan.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-2 border-b border-[var(--c-border)] shrink-0 flex items-center gap-2">
        <ScrollText size={14} className="text-gray-500" />
        <span className="text-xs text-gray-400">
          Operational Flight Plan — {ofp.origin.icao_code} → {ofp.destination.icao_code}
        </span>
        <span className="ml-auto text-xs text-gray-600 font-mono">{ofp.atc?.callsign}</span>
      </div>
      <div className="overflow-auto flex-1 p-5">
        <div
          className="ofp-html"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}

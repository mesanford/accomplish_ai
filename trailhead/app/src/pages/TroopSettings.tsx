import { Leadership } from '../components/settings/Leadership';
import { TroopDetailsForm } from '../components/settings/TroopDetailsForm';
import { NoAccess } from '../components/NoAccess';
import { Loading, PageHeader } from '../components/ui';
import { settingsFrom } from '../lib/troopSettings';
import { useTroop } from '../lib/troop';

/** Leaders only: the troop's details, meeting place, time zone and leadership. */
export function TroopSettings() {
  const { troopId, troop, members, isLeader, loading } = useTroop();
  if (loading) {
    return <Loading />;
  }
  if (!isLeader) {
    return <NoAccess message="Only leaders can change the troop settings." ask="leader" />;
  }
  const saved = settingsFrom(troopId, troop);
  // Keyed on the troop only: re-keying on the saved values would reset a form (and its "Saved.") as it saves.
  const key = troopId;
  return (
    <>
      <PageHeader eyebrow="Troop" title="Troop settings" />
      <section className="card stack" aria-label="Troop details">
        <h2>Troop details</h2>
        <TroopDetailsForm key={key} saved={saved} />
      </section>
      <section className="card stack" aria-label="Leadership">
        <h2>Leadership</h2>
        <Leadership key={key} saved={saved} members={members} />
      </section>
    </>
  );
}

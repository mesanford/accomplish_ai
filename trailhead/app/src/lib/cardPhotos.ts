import { arrayUnion, doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import { cardFileProblem, cardPhotoPath } from './cards';
import { db, storage } from './firebase';

/** Upload photos or PDFs of a paper blue card and list them on the card. Returns the stored paths. */
export async function attachCardFiles(troopId: string, card: { id: string; scoutId: string }, files: File[]): Promise<string[]> {
  for (const file of files) {
    const problem = cardFileProblem(file);
    if (problem) {
      throw new Error(problem);
    }
  }
  const paths: string[] = [];
  for (const file of files) {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const path = cardPhotoPath(troopId, card.scoutId, card.id, file.name, unique);
    await uploadBytes(ref(storage, path), file, { contentType: file.type });
    paths.push(path);
  }
  if (paths.length > 0) {
    await updateDoc(doc(db, `troops/${troopId}/blueCards/${card.id}`), { photoPaths: arrayUnion(...paths) });
  }
  return paths;
}

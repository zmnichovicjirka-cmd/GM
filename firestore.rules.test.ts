
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { readFileSync } from 'fs';

let testEnv: RulesTestEnvironment;

describe('Firestore Security Rules', () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'remixed-project-id',
      firestore: {
        rules: readFileSync('firestore.rules', 'utf8'),
        host: 'localhost',
        port: 8080,
      },
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  const getUnauthenticatedContext = () => testEnv.unauthenticatedContext();
  const getAuthenticatedContext = (uid: string, email: string = 'test@example.com', email_verified: boolean = true) => 
    testEnv.authenticatedContext(uid, { email, email_verified });

  test('Deny all by default', async () => {
    const db = getUnauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'random/doc')));
  });

  describe('Lessons', () => {
    test('User can create their own lesson', async () => {
      const db = getAuthenticatedContext('alice').firestore();
      const lessonRef = doc(db, 'lessons/lesson1');
      await assertSucceeds(setDoc(lessonRef, {
        topic: 'Math',
        study_json: '{}',
        uid: 'alice',
        created_at: new Date(),
      }));
    });

    test('User cannot create lesson for another user', async () => {
      const db = getAuthenticatedContext('alice').firestore();
      const lessonRef = doc(db, 'lessons/lesson1');
      await assertFails(setDoc(lessonRef, {
        topic: 'Math',
        study_json: '{}',
        uid: 'bob',
        created_at: new Date(),
      }));
    });
  });

  describe('User Profiles', () => {
    test('User can manage their own profile', async () => {
      const db = getAuthenticatedContext('alice').firestore();
      const userRef = doc(db, 'users/alice');
      await assertSucceeds(setDoc(userRef, {
        email: 'test@example.com',
        uid: 'alice'
      }));
    });

    test('User cannot manage another profile', async () => {
      const db = getAuthenticatedContext('alice').firestore();
      const userRef = doc(db, 'users/bob');
      await assertFails(getDoc(userRef));
    });
  });

  describe('Admin access', async () => {
    test('Admin can list any lesson', async () => {
      const adminCtx = getAuthenticatedContext('admin_uid', 'chlupatejtypek@gmail.com');
      const db = adminCtx.firestore();
      
      // Seed some data
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, 'lessons/l1'), { uid: 'user1', topic: 'T1', study_json: '{}', created_at: new Date() });
      });

      await assertSucceeds(getDocs(collection(db, 'lessons')));
    });
  });
});

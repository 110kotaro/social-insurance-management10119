import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideFirestore, getFirestore, connectFirestoreEmulator } from '@angular/fire/firestore';
import { provideAuth, getAuth, connectAuthEmulator } from '@angular/fire/auth';
import { provideStorage, getStorage } from '@angular/fire/storage';

import { routes } from './app.routes';
import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideAnimations(),
    provideRouter(routes),
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    // Firestore Emulatorを使用
    provideFirestore(() => {
      const firestore = getFirestore();
      if (environment.useEmulator) {
        try {
          connectFirestoreEmulator(firestore, 'localhost', 8080);
        } catch (error) {
          // Emulator already connected or connection failed
          console.warn('Firestore Emulator connection:', error);
        }
      }
      return firestore;
    }),
    // Auth Emulatorを使用
    provideAuth(() => {
      const auth = getAuth();
      if (environment.useEmulator) {
        try {
          connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
        } catch (error) {
          // Emulator already connected or connection failed
          console.warn('Auth Emulator connection:', error);
        }
      }
      return auth;
    }),
    // Storageは本番環境を使用
    provideStorage(() => getStorage())
  ]
};

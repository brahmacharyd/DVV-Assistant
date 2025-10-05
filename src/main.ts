import { bootstrapApplication } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// Add provideAnimations() to the providers array
bootstrapApplication(App, {
  ...appConfig,
  providers: [...(appConfig.providers || []), provideAnimations()]
}).catch(err => console.error(err));
export type SubtitleDefaultMode = 'auto' | 'off' | 'preferred';

export interface PlaybackPreferencesConfig {
  preferredAudioLanguage: string;
  subtitleDefaultMode: SubtitleDefaultMode;
  preferredSubtitleLanguage: string;
}

const STORAGE_KEY = 'getsmart_playback_preferences_v1';

const DEFAULT_CONFIG: PlaybackPreferencesConfig = {
  preferredAudioLanguage: '',
  subtitleDefaultMode: 'auto',
  preferredSubtitleLanguage: '',
};

class PlaybackPreferencesService {
  private config: PlaybackPreferencesConfig;
  private listeners: Set<(config: PlaybackPreferencesConfig) => void> = new Set();

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): PlaybackPreferencesConfig {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<PlaybackPreferencesConfig>;
        return { ...DEFAULT_CONFIG, ...parsed };
      }
    } catch (error) {
      console.warn('Could not read player audio/subtitle preferences:', error);
    }
    return { ...DEFAULT_CONFIG };
  }

  public getConfig(): PlaybackPreferencesConfig {
    return { ...this.config };
  }

  public saveConfig(partial: Partial<PlaybackPreferencesConfig>): PlaybackPreferencesConfig {
    this.config = { ...this.config, ...partial };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
    } catch (error) {
      console.warn('Could not persist player audio/subtitle preferences:', error);
    }

    this.listeners.forEach((listener) => listener({ ...this.config }));
    return { ...this.config };
  }

  public reset(): PlaybackPreferencesConfig {
    this.config = { ...DEFAULT_CONFIG };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
    } catch (error) {
      console.warn('Could not reset player audio/subtitle preferences:', error);
    }
    this.listeners.forEach((listener) => listener({ ...this.config }));
    return { ...this.config };
  }

  public subscribe(listener: (config: PlaybackPreferencesConfig) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const playbackPreferencesService = new PlaybackPreferencesService();

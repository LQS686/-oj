import { apiClient } from './base';
import type { SystemSettings } from '@/lib/settings-defaults';

export const settingsApi = {
  async getPublicSettings(): Promise<
    Pick<SystemSettings, 'siteName' | 'siteDescription' | 'allowRegistration' | 'defaultLanguage'>
  > {
    return apiClient.get('/settings/public');
  },
};

import { apiClient } from './base';
import type { SystemSettings } from '@/lib/settings';

export const settingsApi = {
  async getPublicSettings(): Promise<SystemSettings> {
    return apiClient.get<SystemSettings>('/settings/public');
  },
};

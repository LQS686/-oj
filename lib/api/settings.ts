import { apiClient } from './base';

interface SystemSettings {
  siteName: string;
  siteDescription: string;
  allowRegistration: boolean;
  allowGuestSubmission: boolean;
  defaultLanguage: string;
  maxSubmissionSize: number;
}

export const settingsApi = {
  async getPublicSettings(): Promise<SystemSettings> {
    return apiClient.get<SystemSettings>('/settings/public');
  },
};

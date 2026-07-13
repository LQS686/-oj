import { apiClient } from './base';
import type { Notification } from '@/types/models';

interface NotificationResponse {
  notifications: Notification[];
  unreadCount: number;
  total: number;
}

export const notificationApi = {
  async getNotifications(page?: number, pageSize?: number): Promise<NotificationResponse> {
    return apiClient.get<NotificationResponse>('/notifications', { page, pageSize });
  },

  async getNotificationById(id: string): Promise<Notification> {
    return apiClient.get<Notification>(`/notifications/${id}`);
  },

  async markAsRead(id: string): Promise<void> {
    return apiClient.put(`/notifications/${id}`);
  },

  async markAllAsRead(): Promise<void> {
    return apiClient.put('/notifications/mark-all-read');
  },
};

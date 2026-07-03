import { apiClient } from './base';

interface LoginResponse {
  user: {
    id: string;
    username: string;
    email: string;
    nickname?: string;
    avatar?: string;
    bio?: string;
    rating: number;
    rank: string;
    color: string;
    role: string;
    createdAt: string;
  };
  token: string;
}

interface RegisterData {
  username: string;
  email: string;
  password: string;
  nickname?: string;
}

interface UserData {
  id: string;
  username: string;
  email: string;
  nickname?: string;
  avatar?: string;
  bio?: string;
  rating: number;
  rank: string;
  color: string;
  role: string;
  createdAt: string;
}

export const authApi = {
  async login(username: string, password: string): Promise<LoginResponse> {
    return apiClient.post<LoginResponse>('/auth/login', { username, password });
  },

  async register(data: RegisterData): Promise<LoginResponse> {
    return apiClient.post<LoginResponse>('/auth/register', data);
  },

  async logout(): Promise<void> {
    return apiClient.post('/auth/logout');
  },

  async getCurrentUser(): Promise<UserData> {
    return apiClient.get<UserData>('/auth/me');
  },

  async forgotPassword(email: string): Promise<void> {
    return apiClient.post('/auth/forgot-password', { email });
  },
};

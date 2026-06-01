const KEY = 'esp_token';

export const getToken = () => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(KEY);
};

export const setToken = (token) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, token);
};

export const clearToken = () => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(KEY);
};

/* auth.js — JWT auth helpers, shared across pages */
(function () {
  const TOKEN_KEY = 'sf_token';
  const USER_KEY = 'sf_user';

  window.Auth = {
    getToken() { return localStorage.getItem(TOKEN_KEY); },
    getUser() {
      try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; }
    },
    setSession(token, user) {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    },
    clearSession() {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    },
    isLoggedIn() { return !!this.getToken(); },

    async apiFetch(path, options = {}) {
      const token = this.getToken();
      const res = await fetch(path, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(options.headers || {})
        },
        body: options.body ? JSON.stringify(options.body) : undefined
      });

      if (res.status === 401) {
        this.clearSession();
        window.location.href = '/';
        return null;
      }

      return res;
    }
  };
})();

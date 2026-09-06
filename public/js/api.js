// public/js/api.js
// Type-safe HTTP fetch client with token persistence and bearer auth injection

const LS_KEY = "btask:session";

export class ApiClient {
  constructor(baseUrl = "") {
    this.baseUrl = baseUrl;
    this.token = "";
    this.username = "";
    if (typeof localStorage !== "undefined") {
      this.token = localStorage.getItem(LS_KEY) || localStorage.getItem("dtask:token") || "";
      this.username = localStorage.getItem(LS_KEY + ":user") || localStorage.getItem("dtask:user") || "";
    }
  }

  getToken() {
    return this.token;
  }

  setToken(token, username = null) {
    this.token = token || "";
    if (typeof localStorage !== "undefined") {
      if (this.token) {
        localStorage.setItem(LS_KEY, this.token);
        localStorage.setItem("dtask:token", this.token);
      } else {
        localStorage.removeItem(LS_KEY);
        localStorage.removeItem("dtask:token");
      }
      if (username) {
        this.username = username;
        localStorage.setItem(LS_KEY + ":user", username);
        localStorage.setItem("dtask:user", username);
      }
    }
  }

  clearToken() {
    this.token = "";
    this.username = "";
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(LS_KEY);
      localStorage.removeItem(LS_KEY + ":user");
      localStorage.removeItem("dtask:token");
      localStorage.removeItem("dtask:user");
    }
  }

  async request(path, options = {}) {
    let url = path;
    if (!path.startsWith("http")) {
      const base = this.baseUrl || (typeof window !== "undefined" && window.location?.origin && window.location.origin !== "null" ? window.location.origin : "");
      url = `${base}/api${path.startsWith("/") ? path : `/${path}`}`;
    }
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {})
    };

    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    } else if (this.username) {
      headers["X-Btask-User"] = this.username;
    }

    const config = {
      ...options,
      headers,
      cache: "no-store"
    };

    if (config.body && typeof config.body === "object" && !(config.body instanceof FormData)) {
      config.body = JSON.stringify(config.body);
    }

    const res = await fetch(url, config);
    const contentType = res.headers.get("content-type") || "";
    let data;
    if (contentType.includes("application/json")) {
      data = await res.json().catch(() => ({}));
    } else {
      data = await res.text().catch(() => "");
    }

    if (!res.ok) {
      const msg = (data && typeof data === "object" && data.error) ? data.error : `HTTP ${res.status}`;
      const error = new Error(msg);
      error.status = res.status;
      error.data = data;
      throw error;
    }

    if (data && typeof data === "object" && data.api_key) {
      this.setToken(data.api_key, data.user?.username || this.username);
    }

    return data;
  }

  async getMe() {
    return this.request("/me");
  }

  async login(username) {
    const data = await this.request("/users", {
      method: "POST",
      body: { username }
    });
    if (data && data.api_key) {
      this.setToken(data.api_key, data.user?.username || username);
    }
    return data;
  }

  async updateMe(body) {
    const data = await this.request("/me", {
      method: "PATCH",
      body
    });
    if (body.username && data.user?.username) {
      this.username = data.user.username;
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(LS_KEY + ":user", this.username);
        localStorage.setItem("dtask:user", this.username);
      }
    }
    return data;
  }

  async getTasks(params = {}) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") {
        sp.set(k, String(v));
      }
    }
    const query = sp.toString();
    return this.request(`/tasks${query ? `?${query}` : ""}`);
  }

  async createTask(body) {
    return this.request("/tasks", {
      method: "POST",
      body
    });
  }

  async updateTask(id, body) {
    return this.request(`/tasks/${id}`, {
      method: "PATCH",
      body
    });
  }

  async deleteTask(id, hard = false) {
    const q = hard ? "?hard=1" : "";
    return this.request(`/tasks/${id}${q}`, {
      method: "DELETE"
    });
  }

  async markDone(id) {
    return this.request(`/tasks/${id}/done`, {
      method: "POST"
    });
  }

  async markUndone(id) {
    return this.request(`/tasks/${id}/undone`, {
      method: "POST"
    });
  }

  async syncTimer(id, action, timeSpent, minutes) {
    const body = { action };
    if (timeSpent !== undefined) body.time_spent = timeSpent;
    if (minutes !== undefined) body.minutes = minutes;
    return this.request(`/tasks/${id}/timer`, {
      method: "POST",
      body
    });
  }

  async updateBook(id, page, pages, bookText) {
    const body = { page };
    if (pages !== undefined) body.pages = pages;
    if (bookText !== undefined) body.book_text = bookText;
    return this.request(`/tasks/${id}/book`, {
      method: "POST",
      body
    });
  }

  async getTimeline(now) {
    const q = (now !== undefined && now !== null) ? `?now=${now}` : "";
    return this.request(`/timeline${q}`);
  }

  async getRewards() {
    return this.request("/rewards");
  }

  async createReward(body) {
    return this.request("/rewards", {
      method: "POST",
      body
    });
  }

  async buyReward(id) {
    return this.request(`/rewards/${id}/buy`, {
      method: "POST"
    });
  }

  async getTransactions() {
    return this.request("/transactions");
  }

  async getStats() {
    return this.request("/stats");
  }

  async logFocus(minutes) {
    return this.request("/stats/focus", {
      method: "POST",
      body: { minutes }
    });
  }
}

export const api = new ApiClient();
if (typeof window !== "undefined") {
  window.api = api;
}

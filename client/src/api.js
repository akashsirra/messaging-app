const BASE_URL = `${import.meta.env.VITE_SERVER_URL || "http://localhost:4000"}/api`;

async function request(path, options = {}) {
  const token = localStorage.getItem("token");
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export const api = {
  register: (username, password) =>
    request("/auth/register", { method: "POST", body: JSON.stringify({ username, password }) }),
  login: (username, password) =>
    request("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  getUsers: () => request("/auth/users"),
  getHistory: (otherUserId) => request(`/messages/${otherUserId}`),
  getVapidPublicKey: () => request("/push/vapid-public-key"),
  subscribePush: (subscription) =>
    request("/push/subscribe", { method: "POST", body: JSON.stringify({ subscription }) }),
  unsubscribePush: (endpoint) =>
    request("/push/unsubscribe", { method: "POST", body: JSON.stringify({ endpoint }) }),
  // File upload can't use the JSON `request` helper above since it needs
  // multipart/form-data, not a JSON body.
  uploadFile: async (file) => {
    const token = localStorage.getItem("token");
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${BASE_URL}/upload`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Upload failed");
    return data;
  },
};
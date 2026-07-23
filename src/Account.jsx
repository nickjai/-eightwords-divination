import React, { useRef, useState } from "react";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import {
  saveProfile,
  sendPasswordReset,
  signInGuest,
  signInWithEmail,
  signOut,
  signUpWithEmail,
  updatePassword,
} from "./supabase.js";

const colors = {
  gold: "#8b6914",
  text: "#5a4a2a",
  muted: "#8a7a5a",
  border: "#d4c5a9",
  danger: "#c23b22",
};

const pageStyle = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  background: "linear-gradient(160deg, #eee8df 0%, #f7ecdf 100%)",
  fontFamily: "'Noto Serif TC', serif",
};

const cardStyle = {
  width: "100%",
  maxWidth: 440,
  padding: 22,
  borderRadius: 12,
  border: `1px solid ${colors.border}`,
  background: "rgba(255,255,255,0.96)",
  boxShadow: "0 12px 40px rgba(70,50,20,0.12)",
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  background: "#fff",
  color: colors.text,
  fontSize: 14,
  fontFamily: "inherit",
};

const primaryButton = {
  width: "100%",
  padding: "10px 14px",
  border: 0,
  borderRadius: 8,
  background: "linear-gradient(135deg,#8b6914,#b8860b)",
  color: "#fff",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
};

const secondaryButton = {
  padding: "8px 12px",
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  background: "#fff",
  color: colors.text,
  cursor: "pointer",
  fontFamily: "inherit",
};

function friendlyError(error) {
  const message = error?.message || String(error || "發生錯誤");
  if (/invalid login credentials/i.test(message)) return "電郵或密碼不正確。";
  if (/email not confirmed/i.test(message)) return "請先到電郵信箱確認帳戶。";
  if (/already registered|user already exists/i.test(message)) return "此電郵已經註冊，請直接登入。";
  if (/password.*(short|characters)|weak password/i.test(message)) return "密碼強度不足，請使用至少 8 個字元。";
  if (/captcha/i.test(message)) return "安全驗證失效，請重新完成 hCaptcha。";
  if (/rate limit|too many/i.test(message)) return "嘗試次數太多，請稍後再試。";
  return message;
}

function Title() {
  return (
    <div style={{ textAlign: "center", marginBottom: 18 }}>
      <div style={{ fontSize: 11, color: colors.muted, letterSpacing: "0.35em" }}>中華術數</div>
      <h1 style={{ margin: "6px 0 4px", fontSize: 26, color: colors.gold }}>卦來卦去</h1>
      <div style={{ fontSize: 12, color: colors.muted }}>登入後，命盤記錄可跨瀏覽器及裝置保存</div>
    </div>
  );
}

export function AuthGate({ onAuthenticated }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const captchaRef = useRef(null);
  const sitekey = import.meta.env.VITE_HCAPTCHA_SITE_KEY;

  const resetCaptcha = () => {
    captchaRef.current?.resetCaptcha();
    setCaptchaToken(null);
  };

  const changeMode = (nextMode) => {
    setMode(nextMode);
    setError("");
    setMessage("");
    setPassword("");
    setConfirmPassword("");
    resetCaptcha();
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!email.trim()) {
      setError("請輸入電郵地址。");
      return;
    }
    if (mode !== "forgot" && password.length < 8) {
      setError("密碼最少需要 8 個字元。");
      return;
    }
    if (mode === "signup" && password !== confirmPassword) {
      setError("兩次輸入的密碼不一致。");
      return;
    }
    if (!captchaToken) {
      setError("請先完成 hCaptcha 安全驗證。");
      return;
    }

    setBusy(true);
    try {
      if (mode === "login") {
        const data = await signInWithEmail(email.trim(), password, captchaToken);
        await onAuthenticated(data.session);
      } else if (mode === "signup") {
        const data = await signUpWithEmail(email.trim(), password, captchaToken);
        if (data.session) {
          await onAuthenticated(data.session);
        } else {
          setMessage("註冊成功！請到電郵信箱按確認連結，然後回來登入。");
          setMode("login");
        }
      } else {
        await sendPasswordReset(email.trim(), captchaToken);
        setMessage("重設密碼電郵已送出，請檢查收件箱及垃圾郵件箱。");
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
      resetCaptcha();
    }
  };

  const continueAsGuest = async () => {
    setError("");
    setMessage("");
    if (!captchaToken) {
      setError("請先完成 hCaptcha 安全驗證。");
      return;
    }
    setBusy(true);
    try {
      await signInGuest(captchaToken);
      await onAuthenticated();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
      resetCaptcha();
    }
  };

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <Title />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 16 }}>
          {[["login", "登入"], ["signup", "註冊新帳戶"]].map(([id, label]) => (
            <button key={id} type="button" onClick={() => changeMode(id)} style={{
              ...secondaryButton,
              borderColor: mode === id ? colors.gold : colors.border,
              background: mode === id ? "#faf4e4" : "#fff",
              color: mode === id ? colors.gold : colors.muted,
              fontWeight: mode === id ? 700 : 400,
            }}>{label}</button>
          ))}
        </div>

        <form onSubmit={submit}>
          <label style={{ display: "block", fontSize: 12, color: colors.muted, marginBottom: 4 }}>電郵地址</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" style={inputStyle} />

          {mode !== "forgot" && (
            <div style={{ marginTop: 10 }}>
              <label style={{ display: "block", fontSize: 12, color: colors.muted, marginBottom: 4 }}>密碼（最少 8 個字元）</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} style={inputStyle} />
            </div>
          )}

          {mode === "signup" && (
            <div style={{ marginTop: 10 }}>
              <label style={{ display: "block", fontSize: 12, color: colors.muted, marginBottom: 4 }}>再次輸入密碼</label>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" style={inputStyle} />
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "center", margin: "16px 0 12px", minHeight: 78 }}>
            {sitekey ? (
              <HCaptcha
                ref={captchaRef}
                sitekey={sitekey}
                onVerify={setCaptchaToken}
                onExpire={() => setCaptchaToken(null)}
                onError={() => {
                  setCaptchaToken(null);
                  setError("hCaptcha 載入失敗，請重新整理後再試。");
                }}
              />
            ) : <div style={{ color: colors.danger, fontSize: 12 }}>網站尚未設定 hCaptcha Sitekey。</div>}
          </div>

          {error && <div style={{ color: colors.danger, fontSize: 12, marginBottom: 10, lineHeight: 1.5 }}>{error}</div>}
          {message && <div style={{ color: "#287a3a", fontSize: 12, marginBottom: 10, lineHeight: 1.6 }}>{message}</div>}

          <button type="submit" disabled={busy} style={{ ...primaryButton, opacity: busy ? 0.6 : 1 }}>
            {busy ? "處理中…" : mode === "login" ? "登入" : mode === "signup" ? "建立帳戶" : "寄出重設密碼電郵"}
          </button>
        </form>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, gap: 8 }}>
          <button type="button" onClick={() => changeMode(mode === "forgot" ? "login" : "forgot")} style={{ border: 0, background: "transparent", color: colors.gold, cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>
            {mode === "forgot" ? "返回登入" : "忘記密碼？"}
          </button>
          <button type="button" onClick={continueAsGuest} disabled={busy} style={{ ...secondaryButton, fontSize: 12 }}>先以訪客使用</button>
        </div>
        <div style={{ marginTop: 12, fontSize: 11, color: colors.muted, lineHeight: 1.6 }}>
          訪客資料會保留在這個瀏覽器；正式帳戶才可在其他裝置登入及取回記錄。
        </div>
      </div>
    </div>
  );
}

export function PasswordRecovery({ onDone }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    if (password.length < 8) {
      setError("密碼最少需要 8 個字元。");
      return;
    }
    if (password !== confirmPassword) {
      setError("兩次輸入的密碼不一致。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await updatePassword(password);
      window.history.replaceState({}, document.title, window.location.pathname);
      onDone();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={pageStyle}>
      <form onSubmit={submit} style={cardStyle}>
        <Title />
        <h2 style={{ color: colors.gold, fontSize: 18, margin: "0 0 12px" }}>設定新密碼</h2>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="新密碼（最少 8 個字元）" autoComplete="new-password" style={inputStyle} />
        <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="再次輸入新密碼" autoComplete="new-password" style={{ ...inputStyle, marginTop: 10 }} />
        {error && <div style={{ color: colors.danger, fontSize: 12, margin: "10px 0" }}>{error}</div>}
        <button type="submit" disabled={busy} style={{ ...primaryButton, marginTop: 14, opacity: busy ? 0.6 : 1 }}>{busy ? "更新中…" : "更新密碼"}</button>
      </form>
    </div>
  );
}

export function AccountPanel({ user, profile, account, onClose, onProfileSaved, onLoggedOut }) {
  const [name, setName] = useState(profile?.display_name || "");
  const [birthYear, setBirthYear] = useState(profile?.birth_year || "");
  const [birthMonth, setBirthMonth] = useState(profile?.birth_month || "");
  const [birthDay, setBirthDay] = useState(profile?.birth_day || "");
  const [birthHour, setBirthHour] = useState(profile?.birth_hour ?? 12);
  const [birthMinute, setBirthMinute] = useState(profile?.birth_minute ?? 0);
  const [gender, setGender] = useState(profile?.gender || "男");
  const [longitude, setLongitude] = useState(profile?.longitude || "114.17");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const isGuest = Boolean(user?.is_anonymous);
  const accountType = account?.account_type || "guest";
  const accountLabel = accountType === "admin" ? "Admin 管理員" : accountType === "vip" ? "VIP 會員" : "Guest 會員";
  const accountColor = accountType === "admin" ? "#c23b22" : accountType === "vip" ? "#a47700" : colors.muted;

  const save = async () => {
    if (!birthYear || !birthMonth || !birthDay) {
      setError("請填寫完整出生年月日。");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await saveProfile({
        display_name: name,
        birth_year: Number(birthYear),
        birth_month: Number(birthMonth),
        birth_day: Number(birthDay),
        birth_hour: Number(birthHour),
        birth_minute: Number(birthMinute),
        gender,
        longitude: Number(longitude) || 114.17,
      });
      await onProfileSaved();
      setMessage("個人資料已儲存。");
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async () => {
    if (newPassword.length < 8) {
      setError("新密碼最少需要 8 個字元。");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await updatePassword(newPassword);
      setNewPassword("");
      setMessage("密碼已更新。");
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    setBusy(true);
    setError("");
    try {
      await signOut();
      onLoggedOut();
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  };

  return (
    <div style={{ ...pageStyle, alignItems: "flex-start", paddingTop: 28 }}>
      <div style={{ ...cardStyle, maxWidth: 560 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 21, color: colors.gold }}>我的帳戶</h1>
            <div style={{ marginTop: 4, fontSize: 12, color: colors.muted }}>{isGuest ? "訪客帳戶" : user?.email}</div>
            <div style={{ marginTop: 5, fontSize: 12, fontWeight: 700, color: accountColor }}>帳戶等級：{accountLabel}</div>
          </div>
          <button type="button" onClick={onClose} style={secondaryButton}>返回</button>
        </div>

        {isGuest && (
          <div style={{ padding: 10, borderRadius: 8, background: "#fff7df", color: colors.text, fontSize: 12, lineHeight: 1.7, marginBottom: 14 }}>
            你目前是訪客。這個登入只會留在本瀏覽器；如要跨裝置使用，請登出後註冊正式帳戶。
          </div>
        )}

        <div style={{ fontSize: 14, fontWeight: 700, color: colors.gold, marginBottom: 2 }}>首次建立的個人資料</div>
        <div style={{ fontSize: 11, color: colors.muted, marginBottom: 8 }}>登入後會自動找回；八字頁亦可按「載入我的資料」。</div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="稱呼" style={inputStyle} />
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: 8, marginTop: 8 }}>
          <input type="number" value={birthYear} onChange={(e) => setBirthYear(e.target.value)} placeholder="出生年" style={inputStyle} />
          <input type="number" min="1" max="12" value={birthMonth} onChange={(e) => setBirthMonth(e.target.value)} placeholder="月" style={inputStyle} />
          <input type="number" min="1" max="31" value={birthDay} onChange={(e) => setBirthDay(e.target.value)} placeholder="日" style={inputStyle} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 8 }}>
          <input type="number" min="0" max="23" value={birthHour} onChange={(e) => setBirthHour(e.target.value)} placeholder="時" style={inputStyle} />
          <input type="number" min="0" max="59" value={birthMinute} onChange={(e) => setBirthMinute(e.target.value)} placeholder="分" style={inputStyle} />
          <select value={gender} onChange={(e) => setGender(e.target.value)} style={inputStyle}><option>男</option><option>女</option></select>
        </div>
        <input type="number" step="0.01" value={longitude} onChange={(e) => setLongitude(e.target.value)} placeholder="經度（例如 114.17）" style={{ ...inputStyle, marginTop: 8 }} />
        <button type="button" onClick={save} disabled={busy} style={{ ...primaryButton, marginTop: 10, opacity: busy ? 0.6 : 1 }}>儲存個人資料</button>

        {!isGuest && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${colors.border}` }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: colors.gold, marginBottom: 8 }}>更改密碼</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="新密碼（最少 8 個字元）" autoComplete="new-password" style={inputStyle} />
              <button type="button" onClick={changePassword} disabled={busy} style={{ ...secondaryButton, whiteSpace: "nowrap" }}>更新</button>
            </div>
          </div>
        )}

        {error && <div style={{ color: colors.danger, fontSize: 12, marginTop: 10 }}>{error}</div>}
        {message && <div style={{ color: "#287a3a", fontSize: 12, marginTop: 10 }}>{message}</div>}

        <button type="button" onClick={logout} disabled={busy} style={{ ...secondaryButton, width: "100%", marginTop: 18, color: colors.danger, borderColor: "#e4b8b0" }}>登出</button>
      </div>
    </div>
  );
}

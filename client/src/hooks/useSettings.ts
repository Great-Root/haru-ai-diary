import { useState, useEffect, useCallback } from "react";
import { getLang, setLang, onLangChange, type Lang } from "@/i18n";

type Theme = "light" | "dark" | "system";
export type Persona = "warm" | "casual";
export type VoiceGender = "female" | "male";

function getSystemDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyTheme(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && getSystemDark());
  document.documentElement.classList.toggle("dark", dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    "content",
    dark ? "#1a1a1a" : "#faf8f5"
  );
}

function getOrCreateUserId(): string {
  // Allow override via URL param (e.g. ?uid=demo for reviewers)
  const params = new URLSearchParams(window.location.search);
  const uidParam = params.get("uid");
  if (uidParam) {
    localStorage.setItem("haru-uid", uidParam);
    // Clean URL
    window.history.replaceState({}, "", window.location.pathname);
    return uidParam;
  }

  let uid = localStorage.getItem("haru-uid");
  if (!uid) {
    uid = crypto.randomUUID();
    localStorage.setItem("haru-uid", uid);
  }
  return uid;
}

export function useSettings() {
  const [userId] = useState(getOrCreateUserId);
  const [theme, setThemeState] = useState<Theme>(() => {
    return (localStorage.getItem("haru-theme") as Theme) || "system";
  });
  const [lang, setLangState] = useState<Lang>(getLang);
  const [persona, setPersonaState] = useState<Persona>(() => {
    return (localStorage.getItem("haru-persona") as Persona) || "casual";
  });
  const [gender, setGenderState] = useState<VoiceGender>(() => {
    return (localStorage.getItem("haru-gender") as VoiceGender) || "female";
  });
  const [autoMute, setAutoMuteState] = useState(() => {
    return localStorage.getItem("haru-autoMute") === "true";
  });
  const [onboarded, setOnboardedState] = useState(() => {
    return localStorage.getItem("haru-onboarded") === "true";
  });
  const [userName, setUserNameState] = useState(() => {
    return localStorage.getItem("haru-userName") || "";
  });
  const [userGender, setUserGenderState] = useState(() => {
    return localStorage.getItem("haru-userGender") || "";
  });
  const [userAgeGroup, setUserAgeGroupState] = useState(() => {
    return localStorage.getItem("haru-userAgeGroup") || "";
  });
  const [speakerMode, setSpeakerModeState] = useState(() => {
    return localStorage.getItem("haru-speakerMode") !== "false";
  });
  const [volume, setVolumeState] = useState(() => {
    return parseFloat(localStorage.getItem("haru-volume") || "0.8");
  });
  const [customAvatar, setCustomAvatar] = useState(() => {
    return localStorage.getItem("haru-customAvatar") || "";
  });

  // Apply theme on change
  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem("haru-theme", theme);
  }, [theme]);

  // Listen for system theme changes
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => { if (theme === "system") applyTheme("system"); };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  // Listen for lang changes
  useEffect(() => {
    return onLangChange(() => setLangState(getLang()));
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
  }, []);

  const changeLang = useCallback((l: Lang) => {
    setLang(l);
    setLangState(l);
  }, []);

  const setPersona = useCallback((p: Persona) => {
    setPersonaState(p);
    localStorage.setItem("haru-persona", p);
  }, []);

  const setGender = useCallback((g: VoiceGender) => {
    setGenderState(g);
    localStorage.setItem("haru-gender", g);
  }, []);

  const setAutoMute = useCallback((v: boolean) => {
    setAutoMuteState(v);
    localStorage.setItem("haru-autoMute", String(v));
  }, []);

  const setSpeakerMode = useCallback((v: boolean) => {
    setSpeakerModeState(v);
    localStorage.setItem("haru-speakerMode", String(v));
  }, []);

  const setVolume = useCallback((v: number) => {
    setVolumeState(v);
    localStorage.setItem("haru-volume", String(v));
  }, []);

  const updateProfile = useCallback(async (name: string, gender: string, ageGroup: string) => {
    setUserNameState(name);
    setUserGenderState(gender);
    setUserAgeGroupState(ageGroup);
    localStorage.setItem("haru-userName", name);
    localStorage.setItem("haru-userGender", gender);
    localStorage.setItem("haru-userAgeGroup", ageGroup);
    fetch(`/api/user/${userId}/profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, gender, age_group: ageGroup }),
    });
  }, [userId]);

  const completeOnboarding = useCallback(async (name: string, gender: string, ageGroup: string) => {
    setUserNameState(name);
    setUserGenderState(gender);
    setUserAgeGroupState(ageGroup);
    localStorage.setItem("haru-userName", name);
    localStorage.setItem("haru-userGender", gender);
    localStorage.setItem("haru-userAgeGroup", ageGroup);
    localStorage.setItem("haru-onboarded", "true");
    // Save to server profile
    fetch(`/api/user/${userId}/profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, gender, age_group: ageGroup }),
    });
    // Set onboarded last to trigger re-render after all state is ready
    setOnboardedState(true);
  }, [userId]);

  const resetData = useCallback(async () => {
    await fetch(`/api/user/${userId}`, { method: "DELETE" });
    localStorage.removeItem("haru-theme");
    localStorage.removeItem("haru-lang");
    localStorage.removeItem("haru-persona");
    localStorage.removeItem("haru-gender");
    localStorage.removeItem("haru-autoMute");
    localStorage.removeItem("haru-speakerMode");
    localStorage.removeItem("haru-volume");
    localStorage.removeItem("haru-onboarded");
    localStorage.removeItem("haru-uid");
    localStorage.removeItem("haru-userName");
    localStorage.removeItem("haru-userGender");
    localStorage.removeItem("haru-userAgeGroup");
    localStorage.removeItem("haru-customAvatar");
    localStorage.removeItem("haru-avatarGenerating");
    // Reset state without reload
    setThemeState("system");
    setPersonaState("casual");
    setGenderState("female");
    setAutoMuteState(false);
    setSpeakerModeState(true);
    setVolumeState(0.8);
    setUserNameState("");
    setUserGenderState("");
    setUserAgeGroupState("");
    setOnboardedState(false);
  }, [userId]);

  return {
    userId, theme, setTheme, lang, setLang: changeLang,
    persona, setPersona, gender, setGender,
    autoMute, setAutoMute, speakerMode, setSpeakerMode,
    volume, setVolume, onboarded, userName, userGender, userAgeGroup,
    customAvatar, setCustomAvatar,
    updateProfile, completeOnboarding, resetData,
  };
}

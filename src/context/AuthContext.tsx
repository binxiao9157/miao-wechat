import React, { createContext, useState, useEffect, useContext, useMemo, useCallback } from 'react';
import { storage, UserInfo } from '../services/storage';

interface AuthContextType {
  user: UserInfo | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  hasCat: boolean;
  catCount: number;
  login: (phone: string, code?: string, password?: string) => Promise<{ success: boolean; error?: string; migrated?: boolean }>;
  register: (phone: string, code: string, nickname: string, password?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  sendCode: (phone: string) => Promise<{ success: boolean; error?: string; mockCode?: string }>;
  updateProfile: (updates: Partial<UserInfo>) => void;
  refreshCatStatus: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // 移除免登录逻辑，每次打开 App 均需重新登录
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [catCount, setCatCount] = useState(0);

  const hasCat = useMemo(() => catCount > 0, [catCount]);

  const refreshCatStatus = useCallback(() => {
    setCatCount(storage.getCatList().length);
  }, []);

  useEffect(() => {
    const savedUser = storage.getUserInfo();
    const savedToken = storage.getToken();

    // 必须同时有 user 和 token 才恢复会话
    if (savedUser && savedToken) {
      console.log("[Auth] 凭证校验通过，恢复会话");
      setUser(savedUser);
      setIsAuthenticated(true);

      // 如果已登录但没猫，尝试一次数据搜救
      if (storage.getCatList().length === 0) {
        console.log("[Auth] 猫咪缺失，启动数据搜救...");
        storage.rescueMyCat();
      }

      refreshCatStatus();
      setIsInitializing(false);
    } else {
      console.log("[Auth] 未发现有效凭证，清理残留");
      storage.clearCurrentUser();
      refreshCatStatus();
      setIsInitializing(false);
    }
  }, [refreshCatStatus]);

  const login = async (id: string, code?: string, password?: string): Promise<{ success: boolean; error?: string; migrated?: boolean }> => {
    try {
      const isUsername = !id.match(/^\d{11}$/);
      const payload = isUsername ? { username: id, password } : { phone: id, code, password };

      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || "登录失败" };
      }

      // 1. 保存用户信息和 token
      const userInfo: UserInfo = {
        id: data.user.id,
        phone: data.user.phone,
        nickname: data.user.nickname,
        avatar: data.user.avatar,
        username: data.user.username || undefined
      };
      storage.saveUserInfo(userInfo);
      storage.saveToken(data.token);
      storage.saveLoginTime(Date.now());
      storage.saveLastActiveTime(Date.now());

      // 2. 尝试迁移旧数据
      const migrationResult = storage.rescueMyCat();
      const didMigrate = migrationResult.count > 0;
      if (didMigrate) {
        console.log(`[RESCUE] 已从 [${migrationResult.source}] 找回 ${migrationResult.count} 只猫咪`);
      }

      // 3. 更新内存状态（不做路由跳转，交给调用方）
      setUser(userInfo);
      setIsAuthenticated(true);
      refreshCatStatus();

      return { success: true, migrated: didMigrate };
    } catch (e) {
      console.error("Login error:", e);
      return { success: false, error: "网络连接失败，请稍后重试" };
    }
  };

  const register = async (phone: string, code: string, nickname: string, password?: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code, nickname, password })
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || "注册失败" };
      }

      const userInfo: UserInfo = {
        id: data.user.id,
        phone: data.user.phone,
        nickname: data.user.nickname,
        avatar: data.user.avatar,
        username: data.user.username || undefined
      };
      storage.saveUserInfo(userInfo);
      storage.saveToken(data.token);
      storage.saveLoginTime(Date.now());
      storage.saveLastActiveTime(Date.now());

      // 尝试迁移旧数据（新注册用户设备上可能有旧账号数据）
      storage.rescueMyCat();

      setUser(userInfo);
      setIsAuthenticated(true);
      refreshCatStatus();

      return { success: true };
    } catch (e) {
      console.error("Register error:", e);
      return { success: false, error: "网络连接失败，请稍后重试" };
    }
  };

  const sendCode = async (phone: string): Promise<{ success: boolean; error?: string; mockCode?: string }> => {
    try {
      const response = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone })
      });
      const data = await response.json();
      if (response.ok) {
        return { success: true, mockCode: data.mockCode };
      } else {
        return { success: false, error: data.error || "验证码发送失败" };
      }
    } catch (e) {
      return { success: false, error: "网络繁忙，请稍后再试" };
    }
  };

  const logout = () => {
    // 1. 同步当前猫咪到全局，确保登录页能看到
    storage.syncLastCat();
    
    // 2. 清除当前用户标识和 Token
    storage.clearCurrentUser();
    
    // 3. 重置所有内存状态，防止数据污染
    setUser(null);
    setIsAuthenticated(false);
    setCatCount(0);
  };

  const updateProfile = (updates: Partial<UserInfo>) => {
    if (user) {
      const newUser = { ...user, ...updates };
      storage.saveUserInfo(newUser);
      setUser(newUser);
    }
  };

  const contextValue = useMemo(() => ({
    user, isAuthenticated, isInitializing, hasCat, catCount, login, register, logout, updateProfile, refreshCatStatus, sendCode
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [user, isAuthenticated, isInitializing, hasCat, catCount]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuthContext = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
};

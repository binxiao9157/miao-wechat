import { useNavigate } from "react-router-dom";
import { Settings, ChevronRight, LogOut, Shield, Bell, FileText, Lock, User as UserIcon, Heart, Calendar, Image as ImageIcon, Camera, Trash2, QrCode, ScanQrCode } from "lucide-react";
import PawIcon from "../components/PawIcon";
import { useAuthContext } from "../context/AuthContext";
import { storage, CatInfo } from "../services/storage";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import InstallPromptBanner from "../components/InstallPromptBanner";
import PageHeader from "../components/PageHeader";
import AdminPresetConfig from "../components/AdminPresetConfig";
import Modal from "../components/Modal";

export default function Profile() {
  const navigate = useNavigate();
  const { user, logout } = useAuthContext();
  const [stats, setStats] = useState({ days: 0, entries: 0 });
  const [activeCat, setActiveCat] = useState<CatInfo | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showBindModal, setShowBindModal] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [showAdmin, setShowAdmin] = useState(false);
  
  // 用于绑定逻辑
  const [bindPhone, setBindPhone] = useState("");
  const [bindCode, setBindCode] = useState("");
  const [bindError, setBindError] = useState("");
  const [isBindingLoading, setIsBindingLoading] = useState(false);

  // ... (rest of useEffect logic remains same)

  const [bindCountdown, setBindCountdown] = useState(0);

  const handleSendBindCode = async () => {
    if (!/^1[3-9]\d{9}$/.test(bindPhone)) {
      setBindError("手机号格式不正确");
      return;
    }
    setBindError("");
    try {
      const response = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: bindPhone })
      });
      const data = await response.json();
      if (response.ok) {
        setBindCountdown(60);
        if (data.mockCode) {
          setBindCode(data.mockCode);
        }
      } else {
        setBindError(data.error || "发送失败");
      }
    } catch {
      setBindError("网络连接失败");
    }
  };

  // Bind countdown timer
  useEffect(() => {
    if (bindCountdown <= 0) return;
    const timer = setTimeout(() => setBindCountdown(bindCountdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [bindCountdown]);

  const handleBindPhone = async () => {
    if (!/^1[3-9]\d{9}$/.test(bindPhone)) {
      setBindError("手机号格式不正确");
      return;
    }
    if (!bindCode) {
      setBindError("请输入验证码");
      return;
    }

    setIsBindingLoading(true);
    setBindError("");

    try {
      const response = await fetch("/api/auth/bind-phone", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user?.id,
          phone: bindPhone,
          code: bindCode
        })
      });

      const data = await response.json();

      if (response.ok) {
        // 后端已更新，同步本地 storage
        storage.bindPhoneAndMigrateData(bindPhone);
        alert("手机号绑定成功！页面将刷新同步数据。");
        window.location.reload();
      } else {
        setBindError(data.error || "绑定失败");
      }
    } catch {
      setBindError("网络连接失败，请重试");
    } finally {
      setIsBindingLoading(false);
    }
  };

  useEffect(() => {
    const loadStats = () => {
      const cat = storage.getActiveCat();
      setActiveCat(cat);

      if (!cat) {
        setStats({ days: 0, entries: 0 });
        return;
      }

      // 1. 计算陪伴天数 (专属)
      const diaries = storage.getDiaries();
      const catDiaries = diaries.filter(d => d.catId === cat.id);
      
      // 优先级：cat.createdAt > 第一条日记时间 > 1天
      let startTime = cat.createdAt;
      if (!startTime && catDiaries.length > 0) {
        // 兜底：取该猫咪最早的一条日记时间
        startTime = Math.min(...catDiaries.map(d => d.createdAt));
      }

      const days = startTime
        ? Math.max(1, Math.ceil((Date.now() - startTime) / (1000 * 60 * 60 * 24)))
        : 1;

      // 2. 计算记录瞬间 (专属)
      setStats({
        days,
        entries: catDiaries.length
      });
    };

    loadStats();

    // 监听活跃猫咪切换、猫咪更新以及日记更新事件，实现实时同步
    window.addEventListener('active-cat-changed', loadStats);
    window.addEventListener('cat-updated', loadStats);
    window.addEventListener('diary-updated', loadStats);
    
    return () => {
      window.removeEventListener('active-cat-changed', loadStats);
      window.removeEventListener('cat-updated', loadStats);
      window.removeEventListener('diary-updated', loadStats);
    };
  }, []);

  const handleLogout = () => {
    logout(); // AuthContext 中的 logout 已包含内存重置与 storage.clearCurrentUser()
    navigate("/login", { replace: true });
  };

  const handleDeleteAccount = () => {
    storage.clearAll(); // 物理删除当前用户的所有数据
    logout(); // 内存清理
    navigate("/register", { replace: true });
  };

  const menuItems = [
    { icon: UserIcon, label: "个人资料设置", path: "/edit-profile", color: "bg-blue-50 text-blue-500" },
    { icon: Shield, label: "绑定手机号", action: () => setShowBindModal(true), color: "bg-green-50 text-green-500" },
    { icon: Bell, label: "消息通知", path: "/notification-settings", color: "bg-orange-50 text-orange-500" },
    { icon: FileText, label: "意见反馈", path: "/feedback", color: "bg-purple-50 text-purple-500" },
  ];

  return (
    <div className="flex flex-col">
      {/* ... (rest of PageHeader) */}
      
      <div className="px-6 pb-6 flex flex-col">
         {/* ... (menuItems rendering needs modification to support action or path) */}
         {menuItems.map((item, index) => (
            <button 
              key={index}
              onClick={item.action ? item.action : () => navigate(item.path!)}
              className="w-full flex items-center justify-between p-4 bg-white rounded-2xl shadow-sm active:scale-[0.98] transition-all hover:shadow-md"
            >
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 ${item.color} rounded-xl flex items-center justify-center`}>
                  <item.icon size={20} />
                </div>
                <span className="font-bold text-on-surface text-sm">{item.label}</span>
              </div>
              <ChevronRight size={16} className="text-on-surface-variant opacity-30" />
            </button>
         ))}

          
          <button 
            onClick={() => setShowLogoutConfirm(true)}
            className="w-full flex items-center justify-between p-4 bg-white rounded-2xl shadow-sm active:scale-[0.98] transition-all hover:shadow-md mt-6"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-gray-50 text-gray-400 rounded-xl flex items-center justify-center">
                <LogOut size={20} />
              </div>
              <span className="font-bold text-on-surface text-sm">退出登录</span>
            </div>
            <ChevronRight size={16} className="text-on-surface-variant opacity-30" />
          </button>

          <button 
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full flex items-center justify-between p-4 bg-red-50 rounded-2xl shadow-sm active:scale-[0.98] transition-all hover:shadow-md mt-4"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-red-100 text-red-500 rounded-xl flex items-center justify-center">
                <Trash2 size={20} />
              </div>
              <span className="font-bold text-red-500 text-sm">注销账户</span>
            </div>
            <ChevronRight size={16} className="text-red-300" />
          </button>
        </div>
        <AnimatePresence>
          {showBindModal && (
            <Modal show={showBindModal} onClose={() => setShowBindModal(false)}>
                <h3 className="text-xl font-bold text-gray-900 mb-4">绑定手机号</h3>
                    <div className="space-y-3 mb-6">
                        <input 
                          type="tel"
                          placeholder="请输入手机号"
                          value={bindPhone}
                          onChange={(e) => setBindPhone(e.target.value)}
                          className="w-full p-3 rounded-xl bg-gray-50 border-none text-sm"
                        />
                        <div className="flex gap-2">
                          <input 
                            type="tel"
                            placeholder="验证码"
                            value={bindCode}
                            onChange={(e) => setBindCode(e.target.value)}
                            className="flex-1 p-3 rounded-xl bg-gray-50 border-none text-sm"
                          />
                          <button
                            onClick={handleSendBindCode}
                            disabled={bindCountdown > 0}
                            className="px-3 text-xs font-bold text-primary disabled:opacity-50"
                          >
                            {bindCountdown > 0 ? `${bindCountdown}s` : "发送"}
                          </button>
                        </div>
                        {bindError && <p className="text-xs text-red-500">{bindError}</p>}
                    </div>
                    <div className="flex gap-3">
                        <button 
                          onClick={handleBindPhone}
                          disabled={isBindingLoading}
                          className="flex-1 py-3 bg-primary text-white rounded-2xl font-bold"
                        >
                          {isBindingLoading ? '绑定中...' : '确定绑定'}
                        </button>
                        <button 
                          onClick={() => setShowBindModal(false)}
                          className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-2xl font-bold"
                        >
                          取消
                        </button>
                    </div>
            </Modal>
          )}
          {showLogoutConfirm && (
            <Modal show={showLogoutConfirm} onClose={() => setShowLogoutConfirm(false)}>
                <div className="text-center">
                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                      <LogOut className="w-8 h-8 text-gray-400" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">退出登录？</h3>
                    <p className="text-sm text-gray-500 mb-8 leading-relaxed">
                      确定要退出登录吗？
                    </p>
                    <div className="flex flex-col gap-3">
                      <button 
                        onClick={handleLogout}
                        className="w-full py-3 bg-primary text-white rounded-2xl font-bold shadow-lg active:scale-95 transition-transform"
                      >
                        确定退出
                      </button>
                      <button 
                        onClick={() => setShowLogoutConfirm(false)}
                        className="w-full py-3 bg-gray-100 text-gray-600 rounded-2xl font-bold active:scale-95 transition-transform"
                      >
                        取消
                      </button>
                    </div>
                </div>
            </Modal>
          )}
          {showDeleteConfirm && (
            <Modal show={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)}>
                <div className="text-center">
                    <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Trash2 className="w-8 h-8 text-red-500" />
                    </div>
                    <h3 className="text-xl font-bold text-red-500 mb-2">注销账户？</h3>
                    <p className="text-sm text-gray-500 mb-8 leading-relaxed">
                      注销账户将永久删除您的所有数据（包括猫咪、日记、信件），此操作不可撤销。确定继续吗？
                    </p>
                    <div className="flex flex-col gap-3">
                      <button 
                        onClick={handleDeleteAccount}
                        className="w-full py-3 bg-red-500 text-white rounded-2xl font-bold shadow-lg active:scale-95 transition-transform"
                      >
                        确定注销
                      </button>
                      <button 
                        onClick={() => setShowDeleteConfirm(false)}
                        className="w-full py-3 bg-gray-100 text-gray-600 rounded-2xl font-bold active:scale-95 transition-transform"
                      >
                        再想想
                      </button>
                    </div>
                </div>
            </Modal>
          )}
        </AnimatePresence>
      </div>

      <footer className="mt-12 text-center pb-10">
        <p 
          onClick={() => {
            setClickCount(prev => {
              const next = prev + 1;
              if (next >= 5) {
                setShowAdmin(true);
                return 0;
              }
              return next;
            });
          }}
          className="text-[10px] font-bold text-on-surface-variant opacity-30 uppercase tracking-widest cursor-pointer select-none"
        >
          Miao Version 1.0.0
        </p>
        <div className="flex justify-center gap-1 mt-1">
          <Heart size={8} className="text-primary fill-current" />
          <Heart size={8} className="text-secondary fill-current" />
          <Heart size={8} className="text-primary fill-current" />
        </div>
      </footer>

      {/* Admin Panel Modal */}
      <AnimatePresence>
        {showAdmin && (
          <AdminPresetConfig onClose={() => setShowAdmin(false)} />
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}

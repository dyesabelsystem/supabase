import React, { useState, useEffect } from 'react';
import { UserPlus, Trash2, Key, X, Save, User as UserIcon, Pencil } from 'lucide-react';
import { AuthService } from '../services/DriveService';
import { useAuth } from '../contexts/AuthContext';
import { useAppDialog } from '../contexts/AppDialogContext';
import { User, USER_ROLES, ROLE_LABELS, ROLE_COLORS, UserRole } from '../types';
import { getSessionToken } from '../utils/session';
import { CustomSelect, CustomSelectOption } from './CustomSelect';
import { SkeletonBlock, SkeletonCircle } from './Skeleton';

interface NewUserState {
  username: string;
  password: string;
  email: string;
  role: UserRole;
  chapterId: string;
}

interface EditUserState {
  userId: string;
  username: string;
  email: string;
  role: UserRole;
  chapterId: string;
}

interface UserManagementProps {
  onBack?: () => void;
}

const roleOptions: CustomSelectOption[] = USER_ROLES.map((role) => ({
  value: role,
  label: ROLE_LABELS[role],
  description:
    role === 'admin'
      ? 'Full platform access'
      : role === 'editor'
        ? 'Global or chapter-scoped editor'
        : role === 'chapter_head'
          ? 'Leads a specific chapter'
          : 'Standard chapter member'
}));

export const UserManagement: React.FC<UserManagementProps> = ({ onBack }) => {
  const { user: currentUser } = useAuth();
  const { showAlert, showConfirm } = useAppDialog();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddUser, setShowAddUser] = useState(false);
  const [showEditUser, setShowEditUser] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  
  const [newUser, setNewUser] = useState<NewUserState>({
    username: '',
    password: '',
    email: '',
    role: 'member',
    chapterId: ''
  });

  const [editUser, setEditUser] = useState<EditUserState>({
    userId: '',
    username: '',
    email: '',
    role: 'member',
    chapterId: ''
  });

  const [passwordData, setPasswordData] = useState({
    newPassword: '',
    confirmPassword: ''
  });

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    const sessionToken = getSessionToken();
    if (!sessionToken) {
      setLoading(false);
      return;
    }

    const result = await AuthService.listUsers(sessionToken);
    if (result.success && result.users) {
      setUsers(result.users);
    }
    setLoading(false);
  };

  const handleAddUser = async () => {
    if (!newUser.username || !newUser.password || !newUser.email) {
      await showAlert('Please fill all required fields');
      return;
    }

    if ((newUser.role === 'chapter_head' || newUser.role === 'member') && !newUser.chapterId) {
      await showAlert('Chapter ID is required for chapter heads and members');
      return;
    }

    if (newUser.role === 'admin' && newUser.chapterId) {
      await showAlert('Admin accounts cannot be assigned to a chapter');
      return;
    }

    const sessionToken = getSessionToken();
    if (!sessionToken) {
      await showAlert('Session expired. Please login again.');
      return;
    }

    const result = await AuthService.createUser(sessionToken, newUser);
    
    if (result.success) {
      await showAlert('User created successfully!', { title: 'User Created' });
      setShowAddUser(false);
      // Reset form
      setNewUser({
        username: '',
        password: '',
        email: '',
        role: 'member',
        chapterId: ''
      });
      loadUsers();
    } else {
      await showAlert('Error creating user: ' + result.error);
    }
  };

  const handleDeleteUser = async (userId: string, username: string) => {
    const shouldDelete = await showConfirm(`Are you sure you want to delete user "${username}"?`, {
      title: 'Delete User',
      confirmLabel: 'Delete'
    });
    if (!shouldDelete) {
      return;
    }

    const sessionToken = getSessionToken();
    if (!sessionToken) {
      await showAlert('Session expired. Please login again.');
      return;
    }

    const result = await AuthService.deleteUser(sessionToken, userId);
    
    if (result.success) {
      await showAlert('User deleted successfully!', { title: 'User Deleted' });
      loadUsers();
    } else {
      await showAlert('Error deleting user: ' + result.error);
    }
  };

  const openEditUserModal = (user: User) => {
    setSelectedUser(user);
    setEditUser({
      userId: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      chapterId: user.chapterId || ''
    });
    setShowEditUser(true);
  };

  const closeEditUserModal = () => {
    setShowEditUser(false);
    setSelectedUser(null);
    setEditUser({
      userId: '',
      username: '',
      email: '',
      role: 'member',
      chapterId: ''
    });
  };

  const handleUpdateUser = async () => {
    if (!editUser.username || !editUser.email) {
      await showAlert('Please fill all required fields');
      return;
    }

    if ((editUser.role === 'chapter_head' || editUser.role === 'member') && !editUser.chapterId) {
      await showAlert('Chapter ID is required for chapter heads and members');
      return;
    }

    if (editUser.role === 'admin' && editUser.chapterId) {
      await showAlert('Admin accounts cannot be assigned to a chapter');
      return;
    }

    const sessionToken = getSessionToken();
    if (!sessionToken) {
      await showAlert('Session expired. Please login again.');
      return;
    }

    const result = await AuthService.updateUser(sessionToken, editUser);

    if (result.success) {
      await showAlert('User updated successfully!', { title: 'User Updated' });
      closeEditUserModal();
      loadUsers();
    } else {
      await showAlert('Error updating user: ' + result.error);
    }
  };

  const handleChangePassword = async () => {
    if (!selectedUser) {
      await showAlert('Select a user before changing a password.');
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      await showAlert('Passwords do not match!');
      return;
    }

    if (passwordData.newPassword.length < 6) {
      await showAlert('Password must be at least 6 characters long');
      return;
    }

    const sessionToken = getSessionToken();
    if (!sessionToken) {
      await showAlert('Session expired. Please login again.');
      return;
    }

    const result = await AuthService.updatePassword(
      sessionToken,
      selectedUser.id,
      passwordData.newPassword
    );

    if (result.success) {
      await showAlert('Password updated successfully!', { title: 'Password Updated' });
      setShowPasswordModal(false);
      setPasswordData({ newPassword: '', confirmPassword: '' });
      setSelectedUser(null);
    } else {
      await showAlert('Error updating password: ' + result.error);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="bg-white dark:bg-[#051923] rounded-2xl shadow-lg border border-white/10 p-6">
          <div className="flex justify-between items-center">
            <div className="space-y-3 w-full max-w-xl">
              <SkeletonBlock className="h-7 w-52" />
              <SkeletonBlock className="h-4 w-full" />
            </div>
            <SkeletonBlock className="hidden sm:block h-11 w-32 rounded-lg" />
          </div>
        </div>

        <div className="bg-white dark:bg-[#051923] rounded-2xl shadow-lg border border-white/10 overflow-hidden">
          <div className="p-6 space-y-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="flex items-center justify-between gap-4 border-b border-gray-200/70 dark:border-white/10 pb-5 last:border-b-0 last:pb-0">
                <div className="flex items-center gap-3 min-w-0">
                  <SkeletonCircle className="w-8 h-8" />
                  <div className="space-y-2">
                    <SkeletonBlock className="h-4 w-32" />
                    <SkeletonBlock className="h-3 w-48 max-w-[40vw]" />
                  </div>
                </div>
                <div className="hidden md:block">
                  <SkeletonBlock className="h-6 w-20 rounded-full" />
                </div>
                <div className="hidden lg:block">
                  <SkeletonBlock className="h-4 w-28" />
                </div>
                <div className="flex gap-2">
                  <SkeletonBlock className="h-8 w-8 rounded-lg" />
                  <SkeletonBlock className="h-8 w-8 rounded-lg" />
                  <SkeletonBlock className="h-8 w-8 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
        {/* Header Section */}
        <div className="bg-white dark:bg-[#051923] rounded-2xl shadow-lg border border-white/10 p-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold text-ocean-deep dark:text-white">User Management</h2>
              <p className="text-ocean-deep/60 dark:text-gray-400 mt-1 text-sm">
                Create and manage admin, editor, chapter head, and member accounts. Editors without a chapter are global editors.
              </p>
            </div>
            <button
              onClick={() => setShowAddUser(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary-blue hover:bg-primary-cyan text-white rounded-lg transition-colors font-bold shadow-lg"
            >
              <UserPlus size={18} />
              Add User
            </button>
          </div>
        </div>

        {/* Users List Table */}
        <div className="bg-white dark:bg-[#051923] rounded-2xl shadow-lg border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-white/5 border-b border-gray-200 dark:border-white/10">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold text-ocean-deep dark:text-white uppercase tracking-wider">User</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-ocean-deep dark:text-white uppercase tracking-wider">Email</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-ocean-deep dark:text-white uppercase tracking-wider">Role</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-ocean-deep dark:text-white uppercase tracking-wider">Chapter ID</th>
                  <th className="px-6 py-4 text-right text-xs font-bold text-ocean-deep dark:text-white uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-white/10">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary-cyan/20 flex items-center justify-center">
                          <UserIcon size={16} className="text-primary-cyan" />
                        </div>
                        <div className="font-bold text-ocean-deep dark:text-white text-sm">
                          {user.username}
                          {user.id === currentUser?.id && <span className="ml-2 text-xs text-primary-cyan">(You)</span>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-ocean-deep/70 dark:text-gray-300">
                      {user.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider text-white ${ROLE_COLORS[user.role]}`}>
                        {ROLE_LABELS[user.role]}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-ocean-deep/70 dark:text-gray-300 font-mono">
                      {user.chapterId || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => openEditUserModal(user)}
                          className="p-1.5 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors text-ocean-deep/70 dark:text-gray-300"
                          title="Edit User"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => { setSelectedUser(user); setShowPasswordModal(true); }}
                          className="p-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors text-blue-600 dark:text-blue-400"
                          title="Change Password"
                        >
                          <Key size={16} />
                        </button>
                        {user.id !== currentUser?.id && (
                          <button
                            onClick={() => handleDeleteUser(user.id, user.username)}
                            className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors text-red-600 dark:text-red-400"
                            title="Delete User"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Add User Modal */}
        {showAddUser && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-[#051923] rounded-2xl shadow-2xl max-w-md w-full border border-white/10 animate-scale-in">
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-black text-ocean-deep dark:text-white">Add New User</h2>
                  <button onClick={() => setShowAddUser(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg">
                    <X size={20} className="text-gray-500 dark:text-gray-400" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-ocean-deep dark:text-gray-400 uppercase mb-1">Username *</label>
                    <input
                      type="text"
                      value={newUser.username}
                      onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                      className="w-full px-4 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-ocean-deep dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-cyan/50 text-sm"
                      placeholder="e.g. juan_delacruz"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-ocean-deep dark:text-gray-400 uppercase mb-1">Email *</label>
                    <input
                      type="email"
                      value={newUser.email}
                      onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                      className="w-full px-4 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-ocean-deep dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-cyan/50 text-sm"
                      placeholder="e.g. juan@dyesabel.ph"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-ocean-deep dark:text-gray-400 uppercase mb-1">Password *</label>
                    <input
                      type="password"
                      value={newUser.password}
                      onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                      className="w-full px-4 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-ocean-deep dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-cyan/50 text-sm"
                      placeholder="Minimum 6 characters"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-ocean-deep dark:text-gray-400 uppercase mb-1">Role *</label>
                    <CustomSelect
                      value={newUser.role}
                      onChange={(nextValue) => {
                        const nextRole = nextValue as UserRole;
                        setNewUser({
                          ...newUser,
                          role: nextRole,
                          chapterId: nextRole === 'admin' ? '' : newUser.chapterId
                        });
                      }}
                      options={roleOptions}
                      ariaLabel="New user role"
                    />
                  </div>

                  {/* ✅ THE "ADD CHAPTER" FUNCTIONALITY IS HERE */}
                  {newUser.role !== 'admin' && (
                    <div className="bg-primary-blue/10 border border-primary-blue/30 rounded-lg p-3">
                      <label className="block text-xs font-bold text-primary-blue dark:text-primary-cyan uppercase mb-1">
                        Chapter ID {newUser.role === 'editor' ? '(Optional)' : '(Required)'}
                      </label>
                      <input
                        type="text"
                        value={newUser.chapterId}
                        onChange={(e) => setNewUser({ ...newUser, chapterId: e.target.value })}
                        className="w-full px-4 py-2 bg-white dark:bg-black/20 border border-primary-blue/30 rounded-lg text-ocean-deep dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-cyan/50 text-sm font-mono"
                        placeholder="e.g. panabo-chapter"
                      />
                      <p className="text-[10px] text-primary-blue/80 dark:text-primary-cyan/80 mt-1">
                        `editor` without a chapter is global. `editor`, `chapter_head`, and `member` with a chapter are scoped to that chapter.
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => setShowAddUser(false)}
                    className="flex-1 px-4 py-2 bg-gray-200 dark:bg-white/10 text-ocean-deep dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-white/20 transition-colors font-bold text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddUser}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary-blue hover:bg-primary-cyan text-white rounded-lg transition-colors font-bold text-sm shadow-lg"
                  >
                    <Save size={16} />
                    Create User
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showEditUser && selectedUser && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-[#051923] rounded-2xl shadow-2xl max-w-md w-full border border-white/10 animate-scale-in">
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-black text-ocean-deep dark:text-white">Edit User</h2>
                  <button onClick={closeEditUserModal} className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg">
                    <X size={20} className="text-gray-500 dark:text-gray-400" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-ocean-deep dark:text-gray-400 uppercase mb-1">Username *</label>
                    <input
                      type="text"
                      value={editUser.username}
                      onChange={(e) => setEditUser({ ...editUser, username: e.target.value })}
                      className="w-full px-4 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-ocean-deep dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-cyan/50 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-ocean-deep dark:text-gray-400 uppercase mb-1">Email *</label>
                    <input
                      type="email"
                      value={editUser.email}
                      onChange={(e) => setEditUser({ ...editUser, email: e.target.value })}
                      className="w-full px-4 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-ocean-deep dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-cyan/50 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-ocean-deep dark:text-gray-400 uppercase mb-1">Role *</label>
                    <CustomSelect
                      value={editUser.role}
                      onChange={(nextValue) => {
                        const nextRole = nextValue as UserRole;
                        setEditUser({
                          ...editUser,
                          role: nextRole,
                          chapterId: nextRole === 'admin' ? '' : editUser.chapterId
                        });
                      }}
                      options={roleOptions}
                      ariaLabel="Edit user role"
                    />
                  </div>

                  {editUser.role !== 'admin' && (
                    <div className="bg-primary-blue/10 border border-primary-blue/30 rounded-lg p-3">
                      <label className="block text-xs font-bold text-primary-blue dark:text-primary-cyan uppercase mb-1">
                        Chapter ID {editUser.role === 'editor' ? '(Optional)' : '(Required)'}
                      </label>
                      <input
                        type="text"
                        value={editUser.chapterId}
                        onChange={(e) => setEditUser({ ...editUser, chapterId: e.target.value })}
                        className="w-full px-4 py-2 bg-white dark:bg-black/20 border border-primary-blue/30 rounded-lg text-ocean-deep dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-cyan/50 text-sm font-mono"
                        placeholder="e.g. panabo-chapter"
                      />
                      <p className="text-[10px] text-primary-blue/80 dark:text-primary-cyan/80 mt-1">
                        `editor` without a chapter is global. `editor`, `chapter_head`, and `member` with a chapter are scoped to that chapter.
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    onClick={closeEditUserModal}
                    className="flex-1 px-4 py-2 bg-gray-200 dark:bg-white/10 text-ocean-deep dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-white/20 transition-colors font-bold text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUpdateUser}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary-blue hover:bg-primary-cyan text-white rounded-lg transition-colors font-bold text-sm shadow-lg"
                  >
                    <Save size={16} />
                    Save Changes
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Change Password Modal */}
        {showPasswordModal && selectedUser && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-[#051923] rounded-2xl shadow-2xl max-w-sm w-full border border-white/10">
              <div className="p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-black text-ocean-deep dark:text-white">Change Password</h2>
                  <button onClick={() => { setShowPasswordModal(false); setPasswordData({ newPassword: '', confirmPassword: '' }); setSelectedUser(null); }} className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg">
                    <X size={20} className="text-gray-500 dark:text-gray-400" />
                  </button>
                </div>
                
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  Updating password for <strong className="text-ocean-deep dark:text-white">{selectedUser.username}</strong>
                </p>

                <div className="space-y-3">
                  <input
                    type="password"
                    value={passwordData.newPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-ocean-deep dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-cyan/50 text-sm"
                    placeholder="New Password"
                  />
                  <input
                    type="password"
                    value={passwordData.confirmPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-ocean-deep dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-cyan/50 text-sm"
                    placeholder="Confirm Password"
                  />
                </div>

                <button
                  onClick={handleChangePassword}
                  className="w-full mt-6 px-4 py-2 bg-primary-blue hover:bg-primary-cyan text-white rounded-lg transition-colors font-bold text-sm shadow-lg flex items-center justify-center gap-2"
                >
                  <Key size={16} />
                  Update Password
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
};

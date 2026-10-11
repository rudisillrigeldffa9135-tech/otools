import type { IAuthLoginRes, ICaptcha, IDoubleTokenRes, IUpdateInfo, IUpdatePassword, IUserInfoRes } from './types/login'
import type { CustomRequestOptions } from '@/http/types'
import { http } from '@/http/http'

/**
 * 登录表单
 */
export interface ILoginForm {
  username: string
  password: string
}

/**
 * 获取验证码
 * @returns ICaptcha 验证码
 */
export function getCode() {
  return http.get<ICaptcha>('/user/getCode')
}

/**
 * 用户登录
 * @param loginForm 登录表单
 */
export function login(loginForm: ILoginForm, options?: Partial<CustomRequestOptions>) {
  return http.post<IAuthLoginRes>('/auth/login', loginForm, undefined, undefined, options)
}

/**
 * 刷新token
 * @param refreshToken 刷新token
 */
export function refreshToken(refreshToken: string) {
  return http.post<IDoubleTokenRes>('/auth/refreshToken', { refreshToken })
}

/**
 * 获取用户信息
 */
export function getUserInfo() {
  return http.get<IUserInfoRes>('/user/info')
}

/**
 * 退出登录
 */
export function logout() {
  return http.get<void>('/auth/logout')
}

/**
 * 修改用户信息
 */
export function updateInfo(data: IUpdateInfo) {
  return http.post('/user/updateInfo', data)
}

/**
 * 修改用户密码
 */
export function updateUserPassword(data: IUpdatePassword) {
  return http.post('/user/updatePassword', data)
}

/**
 * 获取微信登录凭证
 * @returns Promise 包含微信登录凭证(code)
 */
export function getWxCode() {
  return new Promise<UniApp.LoginRes>((resolve, reject) => {
    uni.login({
      provider: 'weixin',
      success: res => resolve(res),
      fail: err => reject(new Error(err)),
    })
  })
}

/**
 * 微信登录
 * @param params 微信登录参数，包含code
 * @returns Promise 包含登录结果
 */
export function wxLogin(data: { code: string }) {
  return http.post<IAuthLoginRes>('/auth/wxLogin', data)
}

/* ---------------- OTools Worker（worker/src/auth.ts）---------------- */

export interface IAuthStatus {
  /** 是否已创建过管理员 */
  initialized: boolean
  /** 是否开放自助注册 */
  allowRegister: boolean
}

export interface IRegisterForm extends ILoginForm {
  nickname?: string
}

/** 系统初始化状态，决定登录页显示「登录」还是「创建管理员」 */
export function getAuthStatus() {
  return http.get<IAuthStatus>('/auth/status')
}

/** 首次使用：创建第一个管理员，成功后直接返回 token */
export function setupAdmin(data: IRegisterForm, options?: Partial<CustomRequestOptions>) {
  return http.post<IAuthLoginRes>('/auth/setup', data, undefined, undefined, options)
}

/** 自助注册（需服务端开启 ALLOW_REGISTER） */
export function register(data: IRegisterForm, options?: Partial<CustomRequestOptions>) {
  return http.post<IAuthLoginRes>('/auth/register', data, undefined, undefined, options)
}

/** 修改自己的密码，成功后其他设备的登录会失效 */
export function changePassword(data: { oldPassword: string, newPassword: string }) {
  return http.post<null>('/user/password', data)
}

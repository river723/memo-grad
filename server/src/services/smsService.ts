/**
 * 短信发送。
 *
 * 阶段 1 只实现 console 通道：把验证码打到日志（并在开发模式回显到响应），
 * 避免为了跑通登录流程先去申请短信资质。接真实通道（阿里云 / 腾讯云）时
 * 只需在这里加一个 provider 分支，调用方无需改动。
 */

import { config } from '../config';

export interface SendResult {
  /** 开发模式下回显验证码，生产恒为 undefined */
  devCode?: string;
}

export async function sendVerificationCode(
  target: string,
  code: string
): Promise<SendResult> {
  switch (config.sms.provider) {
    case 'console':
      // 生产环境绝不能走到这里：验证码进日志等于任何能读日志的人都能登录任意账号
      if (config.isProduction) {
        throw new Error('生产环境不允许使用 console 短信通道，请配置真实的 SMS_PROVIDER');
      }
      console.log(`[SMS:console] → ${target} 验证码 ${code}（${config.sms.codeTtlSeconds}s 内有效）`);
      return config.sms.devEcho ? { devCode: code } : {};

    // TODO(阶段 6): 接入阿里云短信 / 腾讯云短信
    // case 'aliyun': ...

    default:
      throw new Error(`未实现的短信通道: ${config.sms.provider}`);
  }
}

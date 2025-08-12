// Simple SMS sender stub - integrate a real provider (e.g., Twilio) in production
export const sendOtpSms = async (phoneNumber, otp) => {
  // eslint-disable-next-line no-console
  console.log(`[SMS] Sending OTP ${otp} to ${phoneNumber}`);
  return true;
};



import axios from 'axios';

const ORANGE_MONEY_BASE_URL = process.env.ORANGE_MONEY_BASE_URL || 'http://35.242.129.85:80';
const PROJECT_CODE = 'BR';

class OrangeMoneyService {
  constructor() {
    this.token = null;
    this.tokenExpiry = null;
  }

  /**
   * Get access token from Orange Money API
   * @returns {Promise<string>} Access token
   */
  async getAccessToken() {
    try {
      // Check if we have a cached token
      if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry) {
        return this.token;
      }

      const response = await axios.get(`${ORANGE_MONEY_BASE_URL}/token`);
      console.log("response",response);
      if (response.status !== 200) {
        throw new Error(`Token request failed with status ${response.status}`);
      }

      // Token is always returned directly in response.data as a string
      if (!response.data || typeof response.data !== 'string') {
        throw new Error('Invalid token response');
      }

      this.token = response.data;
      // Set token expiry to 1 hour from now (assuming token is valid for 1 hour)
      this.tokenExpiry = Date.now() + (60 * 60 * 1000);
      return this.token;
    } catch (error) {
      throw new Error('Failed to get Orange Money access token');
    }
  }

  /**
   * Initiate payment with Orange Money
   * @param {Object} paymentData - Payment data
   * @param {string} paymentData.msisdn - Phone number
   * @param {number} paymentData.montant - Payment amount
   * @param {string} paymentData.motif - Payment reason (BeStar, VideoCall, Dedication, LiveshowHost, LiveshowJoin)
   * @param {string} paymentData.nameStar - Name of the star (optional)
   * @param {string} paymentData.marchand - Merchant identifier (optional)
   * @returns {Promise<Object>} Payment response
   */
  async initiatePayment(paymentData) {
    try {
      const token = await this.getAccessToken();

      const { msisdn, montant, motif, nameStar, marchand } = paymentData;
      const params = new URLSearchParams({
        msisdn,
        montant: montant.toString(),
        prefixe: PROJECT_CODE,
        motif
      });

      if (nameStar) {
        params.append('nameStar', nameStar);
      }

      if (marchand) {
        params.append('marchand', marchand);
      }

      const response = await axios.post(
        `${ORANGE_MONEY_BASE_URL}/initierPaiementBaroniV2?${params.toString()}`,
        {},
        {
          headers: {
            // Support both raw token and pre-prefixed Bearer tokens
            'Authorization': token?.toLowerCase?.().startsWith('bearer ') ? token : `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.status === 200 && (response.data.code === '200' || response.data.code === 200)) {
        return {
          success: true,
          transactionId: response.data.transactionId,
          message: response.data.data?.message || 'Payment initiated successfully'
        };
      } else {
        const errMsg = response.data?.error || response.data?.message || `Payment initiation failed with status ${response.status}`;
        throw new Error(errMsg);
      }
    } catch (error) {
      console.error('Error initiating Orange Money payment:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      // Bubble up the upstream message to aid debugging while keeping a generic outer message
      throw new Error(error.message || 'Failed to initiate Orange Money payment');
    }
  }

  /**
   * Map Baroni transaction types to Orange Money motifs
   * @param {string} transactionType - Baroni transaction type
   * @returns {string} Orange Money motif
   */
  mapTransactionTypeToMotif(transactionType) {
    const motifMap = {
      'appointment_payment': 'VideoCall',
      'dedication_request_payment': 'Dedicace',
      'dedication_payment': 'Dedicace',
      'live_show_attendance_payment': 'LiveshowJoin',
      'live_show_hosting_payment': 'LiveshowHost',
      'become_star_payment': 'BeStar',
      'service_payment': 'VideoCall' // Default to VideoCall for service payments
    };

    return motifMap[transactionType] || 'VideoCall';
  }

  /**
   * Validate payment callback data
   * @param {Object} callbackData - Callback data from Orange Money
   * @returns {Object} Validated callback data
   */
  validateCallbackData(callbackData) {
    const { transactionId, status, motif, montant } = callbackData;

    if (!transactionId || !status || !montant) {
      throw new Error('Missing required callback data');
    }

    if (!['OK', 'KO'].includes(status)) {
      throw new Error('Invalid payment status');
    }

    return {
      transactionId,
      status: status === 'OK' ? 'completed' : 'failed',
      motif: motif || 'NA',
      amount: parseFloat(montant)
    };
  }
}

export default new OrangeMoneyService();


import axios from 'axios';

const BASE_URL = 'http://127.0.0.1:3001/api';
const LINE_USER_ID = 'U_TEST_USER_001';

async function runTest() {
  console.log('--- Starting API Tests ---');

  // 1. Check Binding (Initial)
  try {
    console.log('\n1. Checking Binding Status (Expect False)...');
    const res1 = await axios.get(`${BASE_URL}/check-binding`, { params: { lineUserId: LINE_USER_ID } });
    console.log('Result:', res1.data);
  } catch (e: any) { console.error('Error:', e.response ? e.response.data : e.message); }

  // 2. Bind User (Using Test Creds)
  try {
    console.log('\n2. Binding User (Expect Success)...');
    const res2 = await axios.post(`${BASE_URL}/bind`, {
      lineUserId: LINE_USER_ID,
      companyId: 'TEST',
      empId: 'E001',
      password: 'any_password'
    });
    console.log('Result:', res2.data);
  } catch (e) { console.error('Error:', e.message); }

  // 3. Check Binding Again
  try {
    console.log('\n3. Checking Binding Status (Expect True)...');
    const res3 = await axios.get(`${BASE_URL}/check-binding`, { params: { lineUserId: LINE_USER_ID } });
    console.log('Result:', res3.data);
  } catch (e) { console.error('Error:', e.message); }

  // 4. Check-in (Batch)
  try {
    console.log('\n4. Performing Batch Check-in...');
    const res4 = await axios.post(`${BASE_URL}/check-in`, {
      lineUserId: LINE_USER_ID,
      dates: ['2026-01-20', '2026-01-21'],
      timeStart: '09:00',
      timeEnd: '18:00',
      reason: 'Forget to punch'
    });
    console.log('Result:', res4.data);
  } catch (e) { console.error('Error:', e.message); }
}

runTest();

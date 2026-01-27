import { HRService } from './src/server/services/hr.service';
import { AuthService } from './src/server/services/auth.service';
import * as cheerio from 'cheerio';

async function main() {
    // Mock user context or login manually if needed
    // However, since I cannot login to real 104, I can only inspect the code or mock the response.
    // The user provided the folder structure which suggests this is a real project.
    // I will simulate the parsing logic based on common HTML table structures since I can't run real requests against 104 API.
    
    // Simulating what `HRService.getLeaveStatus` likely returns (an HTML string) based on typical 104 outputs
    const mockHtml = `
    <html>
        <body>
            <table class="gridview" cellspacing="0" rules="all" border="1" style="border-collapse:collapse;">
                <tr>
                    <th scope="col">假別</th>
                    <th scope="col">總時數</th>
                    <th scope="col">已休</th>
                    <th scope="col">剩餘</th>
                    <th scope="col">期限</th>
                </tr>
                <tr>
                    <td>特休</td>
                    <td>80.0</td>
                    <td>40.0</td>
                    <td>40.0</td>
                    <td>2026/12/31</td>
                </tr>
                 <tr>
                    <td>補休</td>
                    <td>16.0</td>
                    <td>8.0</td>
                    <td>8.0</td>
                    <td>2026/06/30</td>
                </tr>
            </table>
        </body>
    </html>
    `;

    console.log("--- Mock Parsing Test ---");
    const $ = cheerio.load(mockHtml);
    const data: any[] = [];
    
    $('table tr').each((i, el) => {
        if (i === 0) return; // skip header
        const tds = $(el).find('td');
        if (tds.length > 0) {
            data.push({
                name: $(tds[0]).text().trim(),
                total: $(tds[1]).text().trim(),
                used: $(tds[2]).text().trim(),
                balance: $(tds[3]).text().trim(),
                expiry: $(tds[4]).text().trim()
            });
        }
    });

    console.log(JSON.stringify(data, null, 2));
}

main().catch(console.error);

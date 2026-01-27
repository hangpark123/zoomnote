import React from 'react';

const styles = {
  page: {
    padding: '40px',
    fontFamily: '"Malgun Gothic", "Dotum", sans-serif',
    color: '#000',
    maxWidth: '210mm',
    margin: '0 auto',
  },
  headerBox: {
    textAlign: 'center',
    marginBottom: '30px',
  },
  title: {
    fontSize: '28px',
    fontWeight: 'bold',
    textDecoration: 'underline',
    marginBottom: '10px',
  },
  subTitle: {
    fontSize: '16px',
    color: '#555',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    marginBottom: '15px',
    fontSize: '13px',
  },
  th: {
    border: '1px solid #000',
    backgroundColor: '#f0f0f0',
    padding: '8px',
    textAlign: 'center',
    fontWeight: 'bold',
    whiteSpace: 'nowrap',
  },
  td: {
    border: '1px solid #000',
    padding: '8px',
    verticalAlign: 'middle',
  },
  tdCenter: {
    border: '1px solid #000',
    padding: '8px',
    textAlign: 'center',
    verticalAlign: 'middle',
  },
  signatureBox: {
    height: '50px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentBox: {
    border: '1px solid #000',
    height: '400px',
    padding: '15px',
    verticalAlign: 'top',
  }
};

export const ResearchNote = ({ user, date }) => {
  if (!user) return null;

  // ??[?듭떖 濡쒖쭅] ?대쫫 / 吏곹븿 / 遺???쒖꽌濡?議곕┰
  // 1. 諛곗뿴??[?대쫫, 吏곹븿, 遺?? ?쒖꽌?濡??댁뒿?덈떎.
  // 2. filter(Boolean): 媛믪씠 鍮꾩뼱?덇굅??null????ぉ? ?먮룞?쇰줈 類띾땲?? (?щ옒??寃뱀묠 諛⑹?)
  // 3. join(" / "): ?⑥? ??ぉ???ъ씠?ъ씠?먮쭔 " / "瑜??ｌ뒿?덈떎.
  
  // ?덉떆 ?곹솴:
  // - ?대쫫: 諛뺣??? 吏곹븿: ?ъ썝, 遺?? ?좎궗?낃컻諛쒕?  -> "諛뺣???/ ?ъ썝 / ?좎궗?낃컻諛쒕?"
  // - ?대쫫: ?댁??? 吏곹븿: (?놁쓬), 遺?? 媛쒕컻1遺 2? -> "?댁???/ 媛쒕컻1遺 2?" (?щ옒?쒓? 1媛쒕쭔 ?앷?)
  
  const userInfoStr = [user.name, user.job_title, user.department]
    .filter(Boolean) // 鍮?媛?null, undefined, "") ?쒓굅
    .join(" / "); 

  return (
    <div className="print-container" style={styles.page}>
      
      {/* 1. ?ㅻ뜑 */}
      <div style={styles.headerBox}>
        <div style={styles.title}>??援?????/div>
        <div style={styles.subTitle}>?꾩씠?뚮쭅??二? ?뺣낫?듭떊?곌뎄???곌뎄???곌뎄?명듃</div>
      </div>

      {/* 2. 寃곗옱? */}
      <table style={styles.table}>
        <colgroup>
          <col style={{ width: '15%' }} />
          <col style={{ width: '42.5%' }} />
          <col style={{ width: '42.5%' }} />
        </colgroup>
        <thead>
          <tr>
            <th style={styles.th}>援щ텇</th>
            <th style={styles.th}>湲곕줉??/th>
            <th style={styles.th}>?뺤씤??/ ?먭???/th>
          </tr>
        </thead>
        <tbody>
          {/* ?쒕챸 ??*/}
          <tr>
            <td style={styles.tdCenter}><strong>?쒕챸</strong></td>
            <td style={styles.tdCenter}>
              <div style={styles.signatureBox}>
                {/* ??議곕┰??臾몄옄??userInfoStr) 異쒕젰 */}
                <div style={{ marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>
                  {userInfoStr}
                </div>
                <div style={{ fontStyle: 'italic', color: '#ccc' }}>(?쒕챸)</div>
              </div>
            </td>
            <td style={styles.tdCenter}>
              <div style={styles.signatureBox}>
                <span style={{ color: '#ccc' }}>(?쒕챸)</span>
              </div>
            </td>
          </tr>
          {/* ?쒕챸 ?쇱옄 ??*/}
          <tr>
            <td style={styles.tdCenter}><strong>?쒕챸 ?쇱옄</strong></td>
            <td style={styles.tdCenter}>
              {date}
            </td>
            <td style={styles.tdCenter}>
              {/* 怨듬? */}
            </td>
          </tr>
        </tbody>
      </table>

      {/* 3. ?곌뎄 媛쒖슂 ?뺣낫 */}
      <table style={styles.table}>
        <colgroup>
          <col style={{ width: '15%' }} />
          <col style={{ width: '35%' }} />
          <col style={{ width: '15%' }} />
          <col style={{ width: '35%' }} />
        </colgroup>
        <tbody>
          <tr>
            <td style={styles.th}>蹂닿퀬二쇱감</td>
            <td style={styles.td}>2025??12??2二쇱감</td>
            <td style={styles.th}>?쇰젴踰덊샇</td>
            <td style={styles.td}>2025-12-001</td>
          </tr>
          <tr>
            <td style={styles.th}>湲곕줉?쇱옄</td>
            <td style={styles.td}>{date}</td>
            <td style={styles.th}>湲곕줉??/td>
            {/* ???ш린???묎컳???곸슜 */}
            <td style={styles.td}>{userInfoStr}</td>
          </tr>
          <tr>
            <td style={styles.th}>?곌뎄?쒕ぉ</td>
            <td colSpan="3" style={styles.td}>
             Zoom API 湲곕컲 ?먮룞???쒖뒪??怨좊룄??
            </td>
          </tr>
          <tr>
            <td style={styles.th}>?곌뎄湲곌컙</td>
            <td colSpan="3" style={styles.td}>2025.01.01 ~ 2025.12.31</td>
          </tr>
          <tr>
            <td style={styles.th}>湲덉＜紐⑺몴</td>
            <td colSpan="3" style={styles.td}>
               遺?쒕퀎 ?곗씠???곕룞 諛?異쒕젰 ?덉씠?꾩썐 理쒖쟻??
            </td>
          </tr>
        </tbody>
      </table>

      {/* 4. ?곌뎄 ?댁슜 */}
      <div style={styles.contentBox}>
        <h4 style={{ margin: '0 0 15px 0', borderBottom: '1px solid #ddd', paddingBottom: '5px' }}>???곌뎄 ?댁슜</h4>
        <div style={{ lineHeight: '1.8' }}>
          <p>1. <strong>Zoom API ?곕룞 ?곗씠???뺤옣</strong></p>
          <ul style={{ listStyleType: 'circle', marginLeft: '20px' }}>
            <li>API ?묐떟 ?곗씠?곗뿉??<code>job_title</code> ?꾨뱶 異붿텧 諛?UI 諛섏쁺</li>
            <li>寃곗옱? ?쒕챸 ?쇱옄 ??異붽? 諛??먮룞 湲곗엯 濡쒖쭅 援ы쁽</li>
          </ul>

          <p>2. <strong>?곌뎄?명듃 UI/UX 媛쒖꽑</strong></p>
          <ul style={{ listStyleType: 'circle', marginLeft: '20px' }}>
             <li>?몄뇙 ???덉씠?꾩썐 源⑥쭚 ?꾩긽??諛⑹??섍린 ?꾪븳 CSS ?ㅽ??쇰쭅 ?곸슜</li>
             <li>寃곗옱 ?쇱씤 諛??쒕챸? 以묒븰 ?뺣젹 諛곗튂</li>
          </ul>
          
          <p style={{ marginTop: '20px', color: '#999' }}>
            (異붽? ?묒꽦 ?댁슜? 異쒕젰 ???섍린濡?湲곗엯 媛??
          </p>
        </div>
      </div>
      
      <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '14px' }}>
        ?꾩? 媛숈씠 ?곌뎄?명듃瑜?湲곕줉??
      </div>
    </div>
  );
};
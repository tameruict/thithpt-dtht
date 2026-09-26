import { redirect } from 'next/navigation';

// The old subject -> room -> key flow moved to /de-thi (ngân hàng đề thi):
// học sinh xem thẳng danh sách đề đã publish thay vì chọn môn rồi vào phòng.
// Giữ route này lại làm redirect để các link/bookmark cũ không bị vỡ.
export default function SubjectsPage() {
  redirect('/de-thi');
}

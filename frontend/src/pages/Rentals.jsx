import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useToast } from '../components/Toast';
import { todayStr } from '../utils/exportUtils';

const Rentals = () => {
    const queryClient = useQueryClient();
    const { addToast } = useToast();
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState(''); // '', '대여중', '연체', '반납완료'
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const [newRental, setNewRental] = useState({
        name: '',
        email: '',
        item_name: '',
        rent_date: new Date().toISOString().split('T')[0],
        expected_return_date: '',
        notes: ''
    });

    const { data: rentals, isLoading } = useQuery({
        queryKey: ['rentals'],
        queryFn: async () => {
            const { data } = await axios.get('/api/rentals');
            return data;
        }
    });

    let displayedRentals = rentals || [];

    if (statusFilter) {
        displayedRentals = displayedRentals.filter(r => r['상태'] === statusFilter);
    }

    if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        displayedRentals = displayedRentals.filter(row => {
            return Object.values(row).some(val => 
                val !== null && String(val).toLowerCase().includes(q)
            );
        });
    }

    const handleAddSubmit = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await axios.post('/api/rentals', newRental);
            queryClient.invalidateQueries(['rentals']);
            addToast('대여 등록 완료', 'success');
            setIsAddModalOpen(false);
            setNewRental({
                name: '', email: '', item_name: '',
                rent_date: new Date().toISOString().split('T')[0],
                expected_return_date: '', notes: ''
            });
        } catch (err) {
            addToast('등록 실패: ' + (err.response?.data?.detail || err.message), 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleReturn = async (no) => {
        if (!confirm('해당 항목을 반납 처리하시겠습니까?')) return;
        try {
            await axios.put(`/api/rentals/${no}/return`);
            queryClient.invalidateQueries(['rentals']);
            addToast('반납 처리 완료', 'success');
        } catch (err) {
            addToast('반납 처리 실패: ' + (err.response?.data?.detail || err.message), 'error');
        }
    };

    const getStatusBadge = (status) => {
        if (status === '대여중') return <span style={{ backgroundColor: '#eff6ff', color: '#1e3a8a', padding: '2px 8px', borderRadius: '12px', fontSize: '0.85em', fontWeight: 'bold' }}>대여중</span>;
        if (status === '연체') return <span style={{ backgroundColor: '#fef2f2', color: '#991b1b', padding: '2px 8px', borderRadius: '12px', fontSize: '0.85em', fontWeight: 'bold' }}>연체</span>;
        if (status === '반납완료') return <span style={{ backgroundColor: '#f0fdf4', color: '#166534', padding: '2px 8px', borderRadius: '12px', fontSize: '0.85em', fontWeight: 'bold' }}>반납완료</span>;
        return <span>{status}</span>;
    };

    if (isLoading) return <div className="loading"><div className="spinner" /> 데이터 로딩중...</div>;

    return (
        <div>
            <div className="flex items-center justify-between mb-4 dashboard-header-action">
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <h1 style={{ margin: 0 }}>📦 전산품목 대여 관리</h1>
                    <div style={{ backgroundColor: '#eff6ff', color: '#1e3a8a', padding: '4px 12px', borderRadius: '20px', fontWeight: 'bold', fontSize: '0.9rem', border: '1px solid #bfdbfe' }}>
                        총 {displayedRentals.length}건
                    </div>
                </div>
                
                <div className="flex gap-2 items-center">
                    <select 
                        className="form-input" 
                        style={{ width: 'auto', padding: '4px 8px' }} 
                        value={statusFilter} 
                        onChange={(e) => setStatusFilter(e.target.value)}
                    >
                        <option value="">모든 상태</option>
                        <option value="대여중">대여중</option>
                        <option value="연체">연체</option>
                        <option value="반납완료">반납완료</option>
                    </select>

                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <span style={{ position: 'absolute', left: '10px', color: '#9ca3af' }}>🔍</span>
                        <input
                            className="form-input"
                            style={{ padding: '4px 10px 4px 30px', width: '200px' }}
                            placeholder="전체 검색..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <button className="btn btn-primary" onClick={() => setIsAddModalOpen(true)}>
                        ➕ 신규 대여 등록
                    </button>
                    <button className="btn" onClick={() => queryClient.invalidateQueries(['rentals'])}>
                        🔄 새로고침
                    </button>
                </div>
            </div>

            <div className="card" style={{ padding: 0 }}>
                <div className="table-responsive">
                    <table className="table table-striped table-hover mb-0">
                        <thead>
                            <tr>
                                <th>NO</th>
                                <th>대여자 이름</th>
                                <th>대여자 이메일</th>
                                <th>품목명</th>
                                <th>대여 일자</th>
                                <th>반납 예정일</th>
                                <th>실제 반납일</th>
                                <th>상태</th>
                                <th>비고</th>
                                <th>작업</th>
                            </tr>
                        </thead>
                        <tbody>
                            {displayedRentals.length === 0 ? (
                                <tr><td colSpan="10" className="text-center py-4 text-gray-500">대여 내역이 없습니다.</td></tr>
                            ) : (
                                displayedRentals.map((r, i) => (
                                    <tr key={i}>
                                        <td>{r['NO'] || '-'}</td>
                                        <td>{r['대여자 이름'] || '-'}</td>
                                        <td>{r['대여자 이메일'] || '-'}</td>
                                        <td style={{ fontWeight: 'bold' }}>{r['품목명'] || '-'}</td>
                                        <td>{r['대여 일자'] || '-'}</td>
                                        <td>{r['반납 예정일'] || '-'}</td>
                                        <td>{r['실제 반납일'] || '-'}</td>
                                        <td>{getStatusBadge(r['상태'])}</td>
                                        <td>{r['비고'] || '-'}</td>
                                        <td>
                                            {r['상태'] !== '반납완료' && (
                                                <button 
                                                    className="btn btn-sm" 
                                                    style={{ backgroundColor: '#f0fdf4', color: '#166534', border: '1px solid #86efac' }}
                                                    onClick={() => handleReturn(r['NO'])}
                                                >
                                                    반납 확인
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* 신규 대여 등록 모달 */}
            {isAddModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: '600px' }}>
                        <div className="modal-header">
                            <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#1e293b' }}>신규 대여 등록</h2>
                            <button className="modal-close" onClick={() => setIsAddModalOpen(false)}>×</button>
                        </div>
                        <form onSubmit={handleAddSubmit}>
                            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.9rem', fontWeight: 'bold' }}>대여자 이름 *</label>
                                        <input className="form-input" required value={newRental.name} onChange={e => setNewRental({...newRental, name: e.target.value})} />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.9rem', fontWeight: 'bold' }}>대여자 이메일</label>
                                        <input className="form-input" type="email" value={newRental.email} onChange={e => setNewRental({...newRental, email: e.target.value})} />
                                    </div>
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.9rem', fontWeight: 'bold' }}>품목명 *</label>
                                    <input className="form-input" required placeholder="예: 여분 마우스, 테스트용 안드로이드 폰" value={newRental.item_name} onChange={e => setNewRental({...newRental, item_name: e.target.value})} />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.9rem', fontWeight: 'bold' }}>대여 일자 *</label>
                                        <input className="form-input" type="date" required value={newRental.rent_date} onChange={e => setNewRental({...newRental, rent_date: e.target.value})} />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.9rem', fontWeight: 'bold' }}>반납 예정일 *</label>
                                        <input className="form-input" type="date" required value={newRental.expected_return_date} onChange={e => setNewRental({...newRental, expected_return_date: e.target.value})} />
                                    </div>
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.9rem', fontWeight: 'bold' }}>비고</label>
                                    <textarea className="form-input" rows="2" value={newRental.notes} onChange={e => setNewRental({...newRental, notes: e.target.value})}></textarea>
                                </div>
                            </div>
                            <div className="modal-footer" style={{ borderTop: '1px solid #e2e8f0', padding: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', backgroundColor: '#f8fafc' }}>
                                <button type="button" className="btn btn-secondary" onClick={() => setIsAddModalOpen(false)}>취소</button>
                                <button type="submit" className="btn btn-primary" disabled={isSaving}>
                                    {isSaving ? '저장중...' : '등록하기'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Rentals;

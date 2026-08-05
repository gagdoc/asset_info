import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useToast } from '../components/Toast';
import { todayStr } from '../utils/exportUtils';
import SearchableSelect from '../components/SearchableSelect';

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
        quantity: '1',
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

    const { data: usersList } = useQuery({
        queryKey: ['integrated-users'],
        queryFn: async () => {
            const { data } = await axios.get('/api/assets/dashboard/integrated');
            return data;
        }
    });

    const { data: itemsList } = useQuery({
        queryKey: ['consumables-items'],
        queryFn: async () => {
            const { data } = await axios.get('/api/consumables/items');
            return data;
        }
    });

    const userOptions = useMemo(() =>
        (usersList || []).map(u => {
            const englishName = (u.NAME || '').trim().replace(/\./g, ' ');
            const nameOnly = englishName
                || (u.email || '').split('@')[0].replace(/\./g, ' ')
                || (u.이름 || '').replace(/\./g, ' ');
            const fullNameWithBU = `${nameOnly}${u.BU ? ` (${u.BU})` : ''}`;
            return {
                label: nameOnly,
                value: fullNameWithBU,
                subLabel: `${u.email}${u.BU ? ` (${u.BU})` : ''}`,
                name: nameOnly,
                email: u.email,
                bu: u.BU
            };
        }).sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [usersList]);

    const itemOptions = useMemo(() => {
        return (itemsList || []).map(it => ({ 
            label: it.item_name, 
            value: it.item_name, 
            subLabel: it.category 
        }));
    }, [itemsList]);

    let displayedRentals = Array.isArray(rentals) ? rentals : [];

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
            queryClient.invalidateQueries(['consumables-outbound']);
            queryClient.invalidateQueries(['tonner-consignment']);
            queryClient.invalidateQueries(['toner-inventory']);
            addToast('등록 완료', 'success');
            setIsAddModalOpen(false);
            setNewRental({
                name: '', email: '', item_name: '', quantity: '1',
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

    const handleConvertToOutbound = async (no) => {
        if (!confirm('이 대여 물품을 영구 출고로 전환하시겠습니까? (반납 대상에서 제외됩니다)')) return;
        try {
            await axios.put(`/api/rentals/${no}/convert-to-outbound`);
            queryClient.invalidateQueries(['rentals']);
            addToast('영구 출고로 전환되었습니다.', 'success');
        } catch (err) {
            addToast('출고 전환 실패: ' + (err.response?.data?.detail || err.message), 'error');
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

            <div className="card">
                <div className="table-wrapper">
                    <table className="data-table">
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
                                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                                {(r["상태"] === "대여중" || r["상태"] === "연체") && (
                                                    <>
                                                        <button 
                                                            onClick={() => handleReturn(r.NO)}
                                                            className="btn-secondary"
                                                            style={{ fontSize: '0.85em', padding: '4px 10px', minWidth: '60px' }}
                                                        >
                                                            반납
                                                        </button>
                                                        <button 
                                                            onClick={() => handleConvertToOutbound(r.NO)}
                                                            className="btn-danger"
                                                            style={{ fontSize: '0.85em', padding: '4px 10px', minWidth: '80px', backgroundColor: '#f97316', borderColor: '#f97316' }}
                                                        >
                                                            출고 전환
                                                        </button>
                                                    </>
                                                )}
                                            </div>
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
                    <div className="modal" style={{ maxWidth: '600px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#1e293b' }}>신규 대여 등록</h2>
                            <button className="btn-icon" onClick={() => setIsAddModalOpen(false)}>✕</button>
                        </div>
                        <form onSubmit={handleAddSubmit}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.9rem', fontWeight: 'bold' }}>대여자 이름 *</label>
                                        <SearchableSelect 
                                            options={userOptions} 
                                            value={newRental.name}
                                            onChange={val => {
                                                const selected = userOptions.find(u => u.value === val);
                                                if (selected) {
                                                    setNewRental({...newRental, name: selected.name, email: selected.email || ''});
                                                } else {
                                                    setNewRental({...newRental, name: val});
                                                }
                                            }}
                                            placeholder="이름/이메일 검색"
                                            searchFields={["name", "email", "bu"]}
                                            width="100%"
                                            allowCustom={true}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.9rem', fontWeight: 'bold' }}>대여자 이메일</label>
                                        <input className="form-input" type="email" value={newRental.email} onChange={e => setNewRental({...newRental, email: e.target.value})} />
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.9rem', fontWeight: 'bold' }}>품목명 *</label>
                                        <SearchableSelect 
                                            options={itemOptions} 
                                            value={newRental.item_name}
                                            onChange={val => setNewRental({...newRental, item_name: val})}
                                            placeholder="품목 검색 또는 직접 입력"
                                            searchFields={["label", "subLabel"]}
                                            width="100%"
                                            allowCustom={true}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.9rem', fontWeight: 'bold' }}>수량 *</label>
                                        <input className="form-input" type="number" min="1" required value={newRental.quantity} onChange={e => setNewRental({...newRental, quantity: e.target.value})} />
                                    </div>
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
                            <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                                <button type="button" className="btn" onClick={() => setIsAddModalOpen(false)}>취소</button>
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

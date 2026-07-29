import ProductChart from 'components/Cards/ProductGraph';
import SaleReportCard from 'components/Cards/SaleReport';
import GroupSearch from 'components/GroupSearch';
import { useSalesByGroup } from 'hooks/useGroups';
import debounce from 'lodash.debounce';
import { useCallback, useEffect, useMemo, useState } from 'react';

const CategoriesView = ({ dateRange, showNoe, isActive }) => {
    const [selectedGroup, setSelectedGroup] = useState(null);
    const [filteredData, setFilteredData] = useState([]);

    const { data: rawData = [], isLoading } = useSalesByGroup(
        {
            from: dateRange.from,
            to: dateRange.to,
            categoryId: selectedGroup?.groupId,
            showNoe,
        },
        isActive && !!selectedGroup,
    );

    const data = Array.isArray(rawData) ? rawData : [];

    const chartData = useMemo(() => {
        const dataToUse = filteredData?.length ? filteredData : data;
        if (!Array.isArray(dataToUse)) return [];
        return dataToUse.map((item) => ({
            id: item.product,
            label: item.product,
            value: item.rawProfit,
            netProfit: item.netProfit,
        }));
    }, [data, filteredData]);

    const onFilter = useCallback(
        debounce((searchTerm) => {
            const filtered = data.filter((f) => f.product.toLowerCase().includes(searchTerm.toLowerCase()));
            setFilteredData(filtered);
        }, 500),
        [data],
    );

    useEffect(() => {
        setFilteredData([]);
    }, [selectedGroup]);

    return (
        <div>
            <div className="d-flex align-items-center mb-3 gap-3">
                <span className="text-white">Categoría</span>
                <GroupSearch onSelect={setSelectedGroup} />
            </div>
            {selectedGroup ? (
                <div className="row g-3">
                    <div className="col-12 col-lg-6">
                        <SaleReportCard
                            data={filteredData?.length ? filteredData : data}
                            loading={isLoading}
                            onFilter={onFilter}
                        />
                    </div>
                    <div className="col-12 col-lg-6">
                        <ProductChart chartData={chartData} loading={isLoading} />
                    </div>
                </div>
            ) : (
                <div className="text-center text-muted py-5">Seleccione una categoría...</div>
            )}
        </div>
    );
};

export default CategoriesView;

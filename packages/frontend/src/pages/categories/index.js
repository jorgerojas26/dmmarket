import DateRangePicker from 'components/DateRangePicker';
import { useSalesByGroup } from 'hooks/useGroups';
import debounce from 'lodash.debounce';
import { DateTime } from 'luxon';
import { useMemo, useState } from 'react';
import ProductChart from '../../components/Cards/ProductGraph';
import SaleReportCard from '../../components/Cards/SaleReport';
import GroupSearch from '../../components/GroupSearch';

const Categories = () => {
    const [selectedGroup, setSelectedGroup] = useState();
    const [dateRange, setDateRange] = useState({
        from: DateTime.now().startOf('month').toISODate(),
        to: DateTime.now().toISODate(),
    });
    const [filteredData, setFilteredData] = useState([]);

    const { data: rawData = [], isLoading } = useSalesByGroup(
        {
            from: dateRange.from,
            to: dateRange.to,
            categoryId: selectedGroup?.groupId,
        },
        !!selectedGroup,
    );

    const data = Array.isArray(rawData) ? rawData : [];

    const chartData = useMemo(() => {
        const data_to_use = filteredData?.length ? filteredData : data;
        if (!Array.isArray(data_to_use)) return [];
        return data_to_use.reduce(
            (acc, current) => [
                ...acc,
                {
                    id: current.product,
                    label: current.product,
                    value: current.rawProfit,
                    netProfit: current.netProfit,
                },
            ],
            [],
        );
    }, [data, filteredData]);

    const onFilter = debounce((searchTerm) => {
        const filtered = data.filter((f) => f.product.toLowerCase().includes(searchTerm.toLowerCase()));
        setFilteredData(filtered);
    }, 500);

    const handleDateRangeChange = ({ from, to }) => {
        setDateRange({ from, to });
    };

    return (
        <div className="p-4">
            <div className="d-flex justify-content-center w-100">
                <div className="d-flex align-items-center mb-2 gap-3">
                    <span className="text-white">Categoría</span>
                    <GroupSearch onSelect={setSelectedGroup} />
                </div>
            </div>
            <div className="d-flex justify-content-end">
                <DateRangePicker
                    initialFrom={DateTime.now().startOf('month').toISODate()}
                    initialTo={DateTime.now().toISODate()}
                    onChange={handleDateRangeChange}
                />
            </div>

            <div className="d-flex flex-column flex-lg-row justify-content-center align-items-center gap-5 mt-5">
                <div className="w-100">
                    <SaleReportCard
                        data={filteredData?.length ? filteredData : data}
                        loading={isLoading}
                        onFilter={onFilter}
                    />
                </div>
                <div className="w-100">
                    <ProductChart chartData={chartData} loading={isLoading} />
                </div>
            </div>
        </div>
    );
};

export default Categories;
